/**
 * local-db.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Dexie.js (IndexedDB) schema for offline-first storage.
 *
 * Design principles:
 *  • Every row mirrors its Supabase counterpart exactly so sync is a diff-copy.
 *  • Extra metadata columns: sync_status, last_synced_at, local_revision,
 *    server_revision, deleted_at (soft delete).
 *  • bill_number is stored locally but treated as a *display hint*, not a
 *    unique key — the server owns the authoritative sequence.
 *  • The sync_queue table drives the upload engine.
 *  • The sync_checkpoint table stores last-pull cursors.
 */

import Dexie from "dexie";

const DB_NAME = "shree-royal-car-bms";
const DB_VERSION = 1;

/** @type {Dexie} */
let _db = null;

export function getDb() {
  if (_db) return _db;

  const db = new Dexie(DB_NAME);

  db.version(DB_VERSION).stores({
    // ── Core entity tables ──────────────────────────────────────────────────
    customers: [
      "&id",           // UUID primary key (no auto-increment)
      "user_id",
      "phone_number",
      "sync_status",
      "deleted_at",
      "updated_at",
    ].join(","),

    vehicles: [
      "&id",
      "customer_id",
      "user_id",
      "vehicle_number",
      "sync_status",
      "deleted_at",
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
      "deleted_at",
      "updated_at",
      "created_at",
    ].join(","),

    bill_items: [
      "&id",
      "bill_id",
      "user_id",
      "sort_order",
      "sync_status",
      "deleted_at",
    ].join(","),

    workers: [
      "&id",
      "sync_status",
      "deleted_at",
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
    // Each row = one pending cloud operation.
    sync_queue: [
      "++_seq",        // local auto-increment sequence (ordering)
      "&op_id",        // UUID idempotency key — deduplication
      "entity_type",
      "entity_id",
      "operation",     // CREATE | UPDATE | DELETE
      "status",        // pending | processing | done | failed
      "created_at",
      "retry_count",
      "last_attempted_at",
    ].join(","),

    // ── Sync checkpoints ────────────────────────────────────────────────────
    // Stores the "last pulled at" cursor per table so incremental pulls work.
    sync_checkpoint: [
      "&table_name",
    ].join(","),

    // ── PDF blobs ───────────────────────────────────────────────────────────
    // Stores locally-generated PDF blobs before they are uploaded to Storage.
    pdf_cache: [
      "&bill_id",
      "sync_status",   // pending_upload | uploaded
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
  SYNCED:    "synced",
  PENDING:   "pending",
  CONFLICT:  "conflict",
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Stamp every locally-created or locally-edited row with sync metadata. */
export function pendingRow(row) {
  return {
    ...row,
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
    sync_status:     SYNC_STATUS.SYNCED,
    last_synced_at:  new Date().toISOString(),
    server_revision: serverRevision ?? row.server_revision ?? null,
  };
}
