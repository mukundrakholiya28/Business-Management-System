/**
 * data-layer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified data access layer.
 *
 * Pages import from here, not from workshop-data.js (cloud-only) or
 * local-repo.js (local-only).  This module decides which source to use:
 *
 *   • If the local DB is populated → read/write via local-repo (offline-first).
 *   • If the local DB is empty AND we are online → do initial populate, then local.
 *   • Writes always go to local-repo immediately; the sync engine uploads to cloud.
 *
 * All function signatures are identical to workshop-data.js so existing pages
 * work with a one-line import change.
 */

import { supabase } from "./supabase";
import * as local  from "./local-repo";
import * as cloud  from "./workshop-data";
import { runSync, initialPopulate } from "./sync-engine";
import { getDb, SYNC_STATUS } from "./local-db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getCurrentUserId() {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function isLocalPopulated() {
  try {
    const db = getDb();
    // Consider populated if there is at least one customer or bill
    const [cCount, bCount] = await Promise.all([
      db.customers.count(),
      db.bills.count(),
    ]);
    return cCount > 0 || bCount > 0;
  } catch {
    return false;
  }
}

// ─── Public API (mirrors workshop-data.js) ────────────────────────────────────

export { isSupabaseReady } from "./workshop-data";

/**
 * Load all workshop data.
 * On the very first call for a new session, populates IndexedDB from Supabase.
 */
export async function loadWorkshopData() {
  const userId = await getCurrentUserId();

  // Always serve from local first — much faster and works offline
  const populated = await isLocalPopulated();

  if (!populated && userId) {
    // First-time load: try to pull from Supabase, then return local data
    try {
      await initialPopulate(userId);
    } catch (err) {
      console.warn("[data-layer] initialPopulate failed:", err.message);
      // Fall back to direct Supabase fetch if local is empty
      const cloudData = await cloud.loadWorkshopData();
      return cloudData;
    }
  }

  // Return from local DB
  return await local.loadWorkshopData();
}

export async function fetchBillItemsByBillId(billId) {
  return local.fetchBillItemsByBillId(billId);
}

// ─── Customers ───────────────────────────────────────────────────────────────

export async function saveCustomerWithVehicles({ customer, vehicles }) {
  const userId = await getCurrentUserId();
  const result = await local.saveCustomerWithVehicles({ customer, vehicles, userId });
  // Fire-and-forget sync
  runSync().catch(console.warn);
  return result;
}

export async function updateCustomer(customer) {
  const result = await local.updateCustomer(customer);
  runSync().catch(console.warn);
  return result;
}

// ─── Vehicles ─────────────────────────────────────────────────────────────────

export async function saveVehicle(vehicle, isEditing) {
  const userId = await getCurrentUserId();
  const result = await local.saveVehicle(vehicle, isEditing, userId);
  runSync().catch(console.warn);
  return result;
}

// ─── Bills ────────────────────────────────────────────────────────────────────

export async function saveBillWithItems({ bill, items, isEditing }) {
  const userId = await getCurrentUserId();
  const result = await local.saveBillWithItems({ bill, items, isEditing, userId });
  runSync().catch(console.warn);
  return result;
}

export async function deleteBill(billId) {
  await local.deleteBill(billId);
  runSync().catch(console.warn);
}

// ─── Customers / Vehicles deletion ───────────────────────────────────────────

export async function deleteCustomer(customerId) {
  await local.deleteCustomer(customerId);
  runSync().catch(console.warn);
}

export async function deleteVehicle(vehicleId) {
  await local.deleteVehicle(vehicleId);
  runSync().catch(console.warn);
}

// ─── Profile ─────────────────────────────────────────────────────────────────

export async function loadProfile() {
  const userId = await getCurrentUserId();
  return local.loadProfile(userId || "");
}

export async function saveProfile(profile) {
  const userId = await getCurrentUserId();
  const result = await local.saveProfile(profile, userId || "");
  runSync().catch(console.warn);
  return result;
}

// ─── Workers ─────────────────────────────────────────────────────────────────

export async function loadWorkers() {
  return local.loadWorkers();
}

export async function saveWorker(worker) {
  const result = await local.saveWorker(worker);
  runSync().catch(console.warn);
  return result;
}

// ─── Salary records ───────────────────────────────────────────────────────────

export async function loadSalaryRecords() {
  return local.loadSalaryRecords();
}

export async function saveSalaryRecord(record) {
  const result = await local.saveSalaryRecord(record);
  runSync().catch(console.warn);
  return result;
}

// ─── PDF cache ────────────────────────────────────────────────────────────────

export { storePdfLocally, getPdfFromCache } from "./local-repo";

// ─── Paginated loaders (proxied to cloud for backward compat) ─────────────────

export { loadBillsPaginated, loadCustomersPaginated } from "./workshop-data";
