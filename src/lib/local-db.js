/**
 * local-db.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Dexie.js (IndexedDB) schema for offline-first storage.
 *
 * Design principles:
 *  • Every row mirrors its Supabase counterpart exactly so sync is a diff-copy.
 *  • Extra metadata: sync_status, last_synced_at, local_revision,
 *    server_revision, is_deleted (boolean flag — easier to index than null).
 *  • The sync_queue table drives the upload engine.
 *  • The sync_checkpoint table stores last-pull cursors per table.
 *
 * NOTE on deleted_at:
 *  IndexedDB/Dexie cannot filter on null values via an index.
 *  We use a boolean `is_deleted` (0 = live, 1 = deleted) which is indexable.
 */

import Dexie from "dexie";

const DB_NAME    = "shree-royal-car-bms";
const DB_VERSION = 2;  // Bumped: replaced deleted_at (null-indexed) with is_deleted (0/1)

/** @type {Dexie} */
let _db = null;

export function getDb() {
  if (_db) return _db;

  const db = new Dexie(DB_NAME);

  db.version(DB_VERSION).stores({    // ── Core entity tables ──────────────────────────────────────────────────
    // &id = unique primary key (not auto-increment)
    // is_deleted is 0 (live) or 1 (soft-deleted) — indexable boolean
    customers: [
      "&id",
      "user_id",
      "phone_number",
      "sync_status",
      "is_deleted",
      "updated_at",
    ].join(","),

    vehicles: [
      "&id",
      "customer_id",
      "user_id",
      "vehicle_number",
      "sync_status",
      "is_deleted",
      "updated_at",
    ].join(","),

    bills: [
      "&id",
      "customer_id",
      "vehicle_id",
      "user_id",
      "bill_number",
      "status",
      "sync_status",
      "is_deleted",
      "updated_at",
      "created_at",
    ].join(","),

    bill_items: [
      "&id",
      "bill_id",
      "user_id",
      "sort_order",
      "sync_status",
      "is_deleted",
    ].join(","),

    workers: [
      "&id",
      "sync_status",
      "is_deleted",
      "updated_at",
    ].join(","),

    salary_records: [
      "&id",
      "worker_id",
      "sync_status",
      "date_paid",
    ].join(","),

    business_profile: [
      "&id",
      "user_id",
      "sync_status",
      "updated_at",
    ].join(","),

    // ── Sync queue ──────────────────────────────────────────────────────────
    // ++_seq = auto-increment for ordering
    // &op_id = unique idempotency key per operation
    sync_queue: [
      "++_seq",
      "&op_id",
      "entity_type",
      "entity_id",
      "operation",
      "status",
      "created_at",
    ].join(","),

    // ── Sync checkpoints ────────────────────────────────────────────────────
    sync_checkpoint: [
      "&table_name",
    ].join(","),

    // ── PDF blobs ───────────────────────────────────────────────────────────
    pdf_cache: [
      "&bill_id",
      "sync_status",
      "updated_at",
    ].join(","),

    // ── App settings ────────────────────────────────────────────────────────
    app_settings: [
      "&key",
    ].join(","),
  });

  _db = db;
  return db;
}

// ─── Sync status values ───────────────────────────────────────────────────────
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

// ─── Row stamping helpers ─────────────────────────────────────────────────────

/**
 * Stamp every locally-created or locally-edited row with sync metadata.
 * is_deleted = 0 means the row is live (easier to index than null).
 */
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

/** Stamp a row that has just been confirmed by the server. */
export function syncedRow(row, serverRevision = null) {
  return {
    ...row,
    is_deleted:      row.is_deleted ?? 0,
    sync_status:     SYNC_STATUS.SYNCED,
    last_synced_at:  new Date().toISOString(),
    server_revision: serverRevision ?? row.server_revision ?? null,
  };
}
