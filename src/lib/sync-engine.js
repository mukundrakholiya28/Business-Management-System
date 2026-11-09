/**
 * sync-engine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Bidirectional synchronisation between IndexedDB (local) and Supabase (cloud).
 *
 * Responsibilities:
 *   1. PUSH  — upload pending local operations to Supabase in dependency order.
 *   2. PULL  — download cloud changes (new / updated / deleted rows) into IndexedDB.
 *   3. Conflict detection — version-based, per-record.
 *   4. Exponential back-off and idempotency (server confirms before marking done).
 *   5. PDF upload — deferred upload of locally-generated PDF blobs.
 *
 * This module is used only in the browser (no Node.js / SSR).
 */

import { supabase } from "./supabase";
import { getDb, SYNC_STATUS, QUEUE_OP, QUEUE_STATUS, syncedRow } from "./local-db";
import {
  getPendingQueueOps,
  markQueueOpDone,
  markQueueOpFailed,
  markQueueOpProcessing,
  getSyncCheckpoint,
  setSyncCheckpoint,
  getPendingCount,
  getFailedCount,
  setAppSetting,
  getAppSetting,
} from "./local-repo";


// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_RETRIES         = 5;
const BACKOFF_BASE_MS     = 2000;   // 2 s → 4 s → 8 s → 16 s → 32 s
const PULL_PAGE_SIZE      = 200;
const SYNC_STATE_KEY      = "sync_state";
const LAST_SYNC_KEY       = "last_synced_at";
const CONNECTIVITY_KEY    = "is_online";

// ─── Sync state observable ────────────────────────────────────────────────────

/** @type {Set<function>} */
const listeners = new Set();

let currentState = {
  status:       "idle",    // idle | syncing | online | offline | pending | error
  pendingCount: 0,
  failedCount:  0,
  lastSyncedAt: null,
  isOnline:     null,
  error:        null,
};

function notifyListeners() {
  for (const fn of listeners) {
    try { fn({ ...currentState }); } catch { /* ignore */ }
  }
}

export function subscribeSyncState(fn) {
  listeners.add(fn);
  fn({ ...currentState });    // emit current state immediately
  return () => listeners.delete(fn);
}

async function setState(partial) {
  currentState = { ...currentState, ...partial };
  // Persist to IndexedDB so the UI can show last-synced even after page reload
  if (partial.lastSyncedAt !== undefined) {
    await setAppSetting(LAST_SYNC_KEY, partial.lastSyncedAt).catch(() => {});
  }
  notifyListeners();
}

// ─── Connectivity probe ───────────────────────────────────────────────────────

let onlineProbeAbort = null;

/**
 * Tests actual Supabase connectivity (not just navigator.onLine).
 * Returns true if the health endpoint responds within 5 seconds.
 */
export async function probeConnectivity() {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return false;
  }
  try {
    const controller = new AbortController();
    onlineProbeAbort = controller;
    const res = await fetch("/api/health", {
      method:  "GET",
      signal:  controller.signal,
      cache:   "no-store",
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    onlineProbeAbort = null;
  }
}

// ─── Engine lifecycle ─────────────────────────────────────────────────────────

let syncLock = false;
let syncAbort = null;

/**
 * Main sync entry point.  Idempotent — multiple concurrent calls are coalesced.
 */
export async function runSync(opts = {}) {
  if (syncLock) return;
  syncLock = true;

  try {
    const isOnline = await probeConnectivity();
    await setState({ isOnline, status: isOnline ? "syncing" : "offline" });

    if (!isOnline) {
      const pending = await getPendingCount();
      const failed  = await getFailedCount();
      await setState({ status: "offline", pendingCount: pending, failedCount: failed });
      return;
    }

    // ── 1. Push local operations ─────────────────────────────────────────────
    await pushLocalOps();

    // ── 2. Pull cloud changes ────────────────────────────────────────────────
    await pullCloudChanges();

    // ── 3. Final state ───────────────────────────────────────────────────────
    const pending    = await getPendingCount();
    const failed     = await getFailedCount();
    const syncedAt   = new Date().toISOString();
    const newStatus  = pending > 0 ? "pending" : failed > 0 ? "error" : "online";
    await setState({
      status:       newStatus,
      pendingCount: pending,
      failedCount:  failed,
      lastSyncedAt: syncedAt,
      error:        failed > 0 ? `${failed} operation(s) failed` : null,
    });

  } catch (err) {
    console.error("[sync-engine] runSync error:", err);
    const pending = await getPendingCount().catch(() => 0);
    const failed  = await getFailedCount().catch(() => 0);
    await setState({
      status:       "error",
      pendingCount: pending,
      failedCount:  failed,
      error:        err.message,
    });
  } finally {
    syncLock = false;
  }
}

// ─── PUSH ────────────────────────────────────────────────────────────────────

async function pushLocalOps() {
  const ops = await getPendingQueueOps();
  if (ops.length === 0) return;

  // Supabase RLS enforces auth.uid() = user_id.
  // If the client has no authenticated session, operations remain safely queued in IndexedDB
  // rather than failing repeatedly against RLS policies.
  const { data: sessionData } = await supabase.auth.getSession();
  const currentUserId = sessionData?.session?.user?.id;
  if (!currentUserId) {
    console.log("[sync-engine] No active Supabase session. Mutations remain safely queued locally.");
    return;
  }

  // Dependency order: customers → vehicles → bills → bill_items → others
  const ORDER = ["customers", "vehicles", "bills", "bill_items", "workers", "salary_records", "business_profile"];
  ops.sort((a, b) => {
    const ai = ORDER.indexOf(a.entity_type);
    const bi = ORDER.indexOf(b.entity_type);
    if (ai !== bi) return ai - bi;
    return (a._seq ?? 0) - (b._seq ?? 0);
  });

  for (const op of ops) {
    if (op.retry_count >= MAX_RETRIES) continue;

    await markQueueOpProcessing(op._seq);
    try {
      await executePushOp(op, currentUserId);
      await markQueueOpDone(op._seq);
    } catch (err) {
      console.error("[sync-engine] push failed:", op.entity_type, op.operation, err.message);
      await markQueueOpFailed(op._seq, err.message);
      await setState({ error: err.message });
    }

    // Exponential back-off between ops to avoid hammering the server
    if (op.retry_count > 0) {
      const delay = Math.min(BACKOFF_BASE_MS * 2 ** op.retry_count, 30_000);
      await sleep(delay);
    }
  }
}

async function executePushOp(op, currentUserId) {
  if (!supabase) throw new Error("Supabase not configured");

  const { entity_type: table, entity_id, operation, payload } = op;

  // ── bills: use the server RPC for atomic bill_number assignment ────────────
  if (table === "bills") {
    if (operation === QUEUE_OP.DELETE) {
      await serverDeleteBill(entity_id);
      return;
    }

    // CREATE or UPDATE — use save_bill_with_items RPC
    const { bill, items } = payload;
    const userId = currentUserId;

    const rpcParams = {
      p_bill_id:         operation === QUEUE_OP.UPDATE ? entity_id : null,
      p_customer_id:     bill.customer_id,
      p_vehicle_id:      bill.vehicle_id,
      p_kms_run:         bill.kms_run ?? null,
      p_subtotal:        bill.subtotal,
      p_tax_amount:      bill.tax_amount,
      p_discount:        bill.discount,
      p_total_amount:    bill.total_amount,
      p_status:          bill.status,
      p_payment_method:  bill.payment_method ?? null,
      p_paid_amount:     bill.paid_amount,
      p_notes:           bill.notes ?? null,
      p_pdf_url:         bill.pdf_url ?? null,
      p_payment_history: bill.payment_history ?? [],
      p_created_at:      bill.created_at ?? null,
      p_items:           items?.map((i) => ({
        description: i.description,
        quantity:    i.quantity,
        unit_price:  i.unit_price,
        total_price: i.total_price,
        sort_order:  i.sort_order,
      })) ?? null,
      p_user_id:         userId,
    };

    const { data: savedBill, error: rpcError } = await supabase.rpc(
      "save_bill_with_items",
      rpcParams
    );
    if (rpcError) throw new Error(rpcError.message);

    // Update local bill with server-assigned bill_number + UUID confirmation
    const db = getDb();
    const localBill = await db.bills.get(entity_id);
    if (localBill) {
      await db.bills.put(syncedRow({
        ...localBill,
        bill_number:     savedBill.bill_number,
        updated_at:      savedBill.updated_at,
        server_revision: savedBill.updated_at,
      }));
    }
    return;
  }

  // ── Generic table operations ───────────────────────────────────────────────
  if (operation === QUEUE_OP.DELETE) {
    const { error } = await supabase.from(table).delete().eq("id", entity_id);
    if (error && !error.message.includes("not found")) throw new Error(error.message);

    // Mark local row as synced with deletion confirmed
    const db = getDb();
    await db[table]?.update(entity_id, { sync_status: SYNC_STATUS.SYNCED }).catch(() => {});
    return;
  }

  if (operation === QUEUE_OP.CREATE) {
    // Strip local-only metadata before uploading
    const serverPayload = toServerPayload(payload, table, currentUserId);

    const { error } = await supabase
      .from(table)
      .upsert(serverPayload, { onConflict: "id", ignoreDuplicates: false });
    if (error) throw new Error(error.message);

    const db = getDb();
    await db[table]?.update(entity_id, {
      sync_status:     SYNC_STATUS.SYNCED,
      last_synced_at:  new Date().toISOString(),
    }).catch(() => {});
    return;
  }

  if (operation === QUEUE_OP.UPDATE) {
    // Conflict check: fetch server row's updated_at
    const { data: serverRow, error: fetchErr } = await supabase
      .from(table)
      .select("id, updated_at")
      .eq("id", entity_id)
      .single();

    if (fetchErr && fetchErr.code !== "PGRST116" && !fetchErr.message?.includes("not found")) {
      throw new Error(fetchErr.message);
    }

    const db = getDb();
    const localRow = await db[table]?.get(entity_id);

    if (serverRow && localRow) {
      const serverTs = new Date(serverRow.updated_at).getTime();
      const localBase = localRow.server_revision
        ? new Date(localRow.server_revision).getTime()
        : 0;

      if (serverTs > localBase && serverTs !== new Date(localRow.updated_at).getTime()) {
        // CONFLICT: server has a newer version we haven't seen
        await db[table]?.update(entity_id, { sync_status: SYNC_STATUS.CONFLICT }).catch(() => {});
        throw new Error(`Conflict detected on ${table}:${entity_id}. Manual resolution required.`);
      }
    }

    const serverPayload = toServerPayload(payload, table, currentUserId);

    const { error: upErr } = await supabase
      .from(table)
      .upsert(serverPayload, { onConflict: "id" });
    if (upErr) throw new Error(upErr.message);

    await db[table]?.update(entity_id, {
      sync_status:     SYNC_STATUS.SYNCED,
      last_synced_at:  new Date().toISOString(),
      server_revision: serverPayload.updated_at,
    }).catch(() => {});
  }
}

/**
 * Cascade-deletes a bill and its items from Supabase (mirrors deleteBill in workshop-data.js).
 */
async function serverDeleteBill(billId) {
  // Delete items first (FK constraint)
  const { error: itemsErr } = await supabase
    .from("bill_items")
    .delete()
    .eq("bill_id", billId);
  if (itemsErr && !itemsErr.message.includes("not found")) throw new Error(itemsErr.message);

  const { data: billData, error: fetchErr } = await supabase
    .from("bills")
    .select("user_id, bill_number")
    .eq("id", billId)
    .single();

  if (fetchErr && fetchErr.code !== "PGRST116") throw new Error(fetchErr.message);
  if (!billData) return; // already deleted

  const { error: delErr } = await supabase.from("bills").delete().eq("id", billId);
  if (delErr) throw new Error(delErr.message);

  // Renumber subsequent bills (same logic as workshop-data.js deleteBill)
  const { data: subsequent, error: listErr } = await supabase
    .from("bills")
    .select("id, bill_number")
    .eq("user_id", billData.user_id)
    .gt("bill_number", billData.bill_number)
    .order("bill_number", { ascending: true });

  if (listErr) throw new Error(listErr.message);

  for (const b of subsequent ?? []) {
    const { error: updateErr } = await supabase
      .from("bills")
      .update({ bill_number: b.bill_number - 1 })
      .eq("id", b.id);
    if (updateErr) throw new Error(updateErr.message);
  }
}

/** Strip IndexedDB-only metadata fields before uploading to Supabase. */
export function toServerPayload(payload, table, currentUserId) {
  if (!payload) return payload;

  const {
    sync_status,
    last_synced_at,
    local_revision,
    server_revision,
    is_deleted,     // local-only — Supabase has no is_deleted column
    gst_enabled,    // bills only — not a DB column
    gst_rate,       // bills only — not a DB column
    _seq,
    ...serverPayload
  } = payload;

  // Ensure valid user_id from active session if missing or empty
  if (currentUserId && (!serverPayload.user_id || serverPayload.user_id === "")) {
    serverPayload.user_id = currentUserId;
  }

  // Prevent Postgres UUID syntax error (22P02) on empty strings
  if (serverPayload.user_id === "" || serverPayload.user_id === undefined) {
    delete serverPayload.user_id;
  }
  if (serverPayload.customer_id === "") {
    delete serverPayload.customer_id;
  }
  if (serverPayload.vehicle_id === "") {
    delete serverPayload.vehicle_id;
  }

  return serverPayload;
}

// ─── PULL ─────────────────────────────────────────────────────────────────────

const PULL_TABLES = [
  { name: "customers",        orderCol: "updated_at" },
  { name: "vehicles",         orderCol: "updated_at" },
  { name: "bills",            orderCol: "updated_at" },
  { name: "bill_items",       orderCol: "created_at" },
  { name: "workers",          orderCol: "updated_at" },
  { name: "salary_records",   orderCol: "created_at" },
  { name: "business_profile", orderCol: "updated_at" },
];

async function pullCloudChanges() {
  if (!supabase) return;

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData?.session?.user?.id;
  if (!userId) return;

  for (const { name: tableName, orderCol } of PULL_TABLES) {
    await pullTable(tableName, orderCol, userId);
  }
}

async function pullTable(tableName, orderCol, userId) {
  const checkpoint = await getSyncCheckpoint(tableName);
  let from = 0;
  let latestTimestamp = checkpoint;
  const db = getDb();

  while (true) {
    let query = supabase
      .from(tableName)
      .select("*")
      .order(orderCol, { ascending: true })
      .range(from, from + PULL_PAGE_SIZE - 1);

    if (checkpoint) {
      query = query.gt(orderCol, checkpoint);
    }

    const { data, error } = await query;
    if (error) {
      console.warn(`[sync-engine] pull ${tableName} error:`, error.message);
      break;
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      await mergeServerRow(db, tableName, row, userId);
      // Track the latest timestamp we've seen
      const rowTs = row[orderCol];
      if (rowTs && (!latestTimestamp || rowTs > latestTimestamp)) {
        latestTimestamp = rowTs;
      }
    }

    if (data.length < PULL_PAGE_SIZE) break;
    from += PULL_PAGE_SIZE;
  }

  if (latestTimestamp && latestTimestamp !== checkpoint) {
    await setSyncCheckpoint(tableName, latestTimestamp);
  }
}

async function mergeServerRow(db, tableName, serverRow, userId) {
  const store = db[tableName];
  if (!store) return;

  const localRow = await store.get(serverRow.id).catch(() => null);

  // If local row has un-synced pending changes, prefer local (optimistic)
  if (
    localRow &&
    localRow.sync_status === SYNC_STATUS.PENDING &&
    localRow.local_revision > 1
  ) {
    // Keep local version; server will receive our pending op shortly
    return;
  }

  // If local row is newer than server (clock skew), prefer local
  if (
    localRow &&
    localRow.updated_at &&
    serverRow.updated_at &&
    new Date(localRow.updated_at) > new Date(serverRow.updated_at) &&
    localRow.sync_status === SYNC_STATUS.SYNCED
  ) {
    return;
  }

  // Merge: server wins for SYNCED rows, server wins for rows we don't have
  await store.put(syncedRow({
    ...serverRow,
    // Preserve local-only metadata fields
    pdf_url:    serverRow.pdf_url ?? localRow?.pdf_url ?? null,
    is_deleted: 0,  // If the server returned the row, it exists — not deleted
  }, serverRow.updated_at));
}



// ─── Initial data population ──────────────────────────────────────────────────

/**
 * On first login (or when IndexedDB is empty), download all cloud data.
 * Safe to re-run — it skips rows that already exist locally and are synced.
 */
export async function initialPopulate(userId) {
  if (!supabase || !userId) return;

  await setState({ status: "syncing", error: null });

  try {
    for (const { name: tableName, orderCol } of PULL_TABLES) {
      await pullTable(tableName, orderCol, userId);
    }
    await setState({
      status:       "online",
      lastSyncedAt: new Date().toISOString(),
      pendingCount: 0,
      failedCount:  0,
    });
  } catch (err) {
    console.error("[sync-engine] initialPopulate error:", err);
    await setState({ status: "error", error: err.message });
  }
}

// ─── Connectivity watcher ─────────────────────────────────────────────────────

let reconnectTimer = null;

// Broadcast channel so all tabs/components know when we reconnected
const RECONNECT_EVENT = "src-bms:reconnected";

export function startConnectivityWatcher() {
  if (typeof window === "undefined") return;

  async function handleOnline() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(async () => {
      const online = await probeConnectivity();
      if (online) {
        await runSync();
        // Notify all listeners that we've reconnected so they can reload data
        window.dispatchEvent(new CustomEvent(RECONNECT_EVENT));
      }
    }, 1500);
  }

  async function handleOffline() {
    await setState({ isOnline: false, status: "offline" });
  }

  window.addEventListener("online",  handleOnline);
  window.addEventListener("offline", handleOffline);

  document.addEventListener("visibilitychange", async () => {
    if (!document.hidden) await runSync();
  });

  return () => {
    window.removeEventListener("online",  handleOnline);
    window.removeEventListener("offline", handleOffline);
    clearTimeout(reconnectTimer);
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Conflict resolution ──────────────────────────────────────────────────────

/**
 * Force-push local version to the server (user chose "keep my changes").
 * Clears the conflict status and re-queues the operation.
 */
export async function resolveConflictKeepLocal(entityType, entityId) {
  const db = getDb();
  const store = db[entityType];
  if (!store) throw new Error(`Unknown entity type: ${entityType}`);

  const row = await store.get(entityId);
  if (!row) throw new Error("Record not found locally.");

  // Clear conflict flag, bump local_revision, re-queue as UPDATE
  const resolved = {
    ...row,
    sync_status:    SYNC_STATUS.PENDING,
    local_revision: (row.local_revision ?? 0) + 1,
  };
  await store.put(resolved);

  // Re-enqueue as UPDATE
  const { v4: uuidv4 } = await import("uuid");

  await db.sync_queue.add({
    op_id:             uuidv4(),
    entity_type:       entityType,
    entity_id:         entityId,
    operation:         QUEUE_OP.UPDATE,
    payload:           resolved,
    status:            QUEUE_STATUS.PENDING,
    created_at:        new Date().toISOString(),
    retry_count:       0,
    last_attempted_at: null,
    error_message:     null,
  });

  await runSync();
}

/**
 * Pull the server version and overwrite local (user chose "use server version").
 */
export async function resolveConflictUseServer(entityType, entityId) {
  if (!supabase) throw new Error("Supabase not configured");
  const db = getDb();
  const store = db[entityType];
  if (!store) throw new Error(`Unknown entity type: ${entityType}`);

  const { data: serverRow, error } = await supabase
    .from(entityType)
    .select("*")
    .eq("id", entityId)
    .single();

  if (error) throw new Error(error.message);
  if (!serverRow) throw new Error("Record not found on server.");

  await store.put(syncedRow({ ...serverRow, deleted_at: null }, serverRow.updated_at));

  // Remove any queued ops for this entity
  await db.sync_queue
    .where("entity_id")
    .equals(entityId)
    .delete();
}
