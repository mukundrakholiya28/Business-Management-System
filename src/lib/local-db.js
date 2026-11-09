/**
 * local-db.js — Dexie/IndexedDB schema.
 * Browser-only. Every exported function guards against SSR.
 */

// ── Defer Dexie import so it never runs on the server ──────────────────────
let _db = null;

export function isIndexedDbAvailable() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

export function getDb() {
  if (!isIndexedDbAvailable()) {
    throw new Error("IndexedDB is not available in this environment.");
  }

  if (_db) return _db;

  // Require Dexie synchronously — safe because we only reach here in the browser
  const Dexie = require("dexie").default ?? require("dexie");

  const db = new Dexie("cars-bms");

  // Version 2: uses is_deleted (0/1) instead of deleted_at (null — not indexable)
  db.version(2).stores({
    customers:        "&id, user_id, phone_number, sync_status, is_deleted, updated_at",
    vehicles:         "&id, customer_id, user_id, vehicle_number, sync_status, is_deleted, updated_at",
    bills:            "&id, customer_id, vehicle_id, user_id, bill_number, status, sync_status, is_deleted, updated_at, created_at",
    bill_items:       "&id, bill_id, user_id, sort_order, sync_status, is_deleted",
    workers:          "&id, sync_status, is_deleted, updated_at",
    salary_records:   "&id, worker_id, sync_status, date_paid",
    business_profile: "&id, user_id, sync_status, updated_at",
    sync_queue:       "++_seq, &op_id, entity_type, entity_id, operation, status, created_at",
    sync_checkpoint:  "&table_name",
    pdf_cache:        "&bill_id, sync_status, updated_at",
    app_settings:     "&key",
  });

  // Version 3: drops pdf_cache
  db.version(3).stores({
    pdf_cache: null,
  });

  // Version 4: indexes user_id on workers and salary_records for RLS alignment
  db.version(4).stores({
    workers:        "&id, user_id, sync_status, is_deleted, updated_at",
    salary_records: "&id, user_id, worker_id, sync_status, date_paid",
  });

  _db = db;
  return db;
}

// ─── Sync status constants ────────────────────────────────────────────────────

export const SYNC_STATUS = {
  SYNCED:   "synced",
  PENDING:  "pending",
  CONFLICT: "conflict",
};

export const QUEUE_STATUS = {
  PENDING:    "pending",
  PROCESSING: "processing",
  DONE:       "done",
  FAILED:     "failed",
};

export const QUEUE_OP = {
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
};

// ─── Row stamping ─────────────────────────────────────────────────────────────

export function pendingRow(row) {
  return {
    ...row,
    is_deleted:      row.is_deleted      ?? 0,
    sync_status:     SYNC_STATUS.PENDING,
    last_synced_at:  null,
    local_revision:  (row.local_revision ?? 0) + 1,
    server_revision: row.server_revision ?? null,
  };
}

export function syncedRow(row, serverRevision = null) {
  return {
    ...row,
    is_deleted:      row.is_deleted ?? 0,
    sync_status:     SYNC_STATUS.SYNCED,
    last_synced_at:  new Date().toISOString(),
    server_revision: serverRevision ?? row.server_revision ?? null,
  };
}
