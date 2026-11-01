/**
 * data-layer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified data access layer — offline-first.
 *
 * Critical design rule:
 *   loadWorkshopData() ALWAYS returns immediately from IndexedDB.
 *   It NEVER awaits a network call. Background sync happens separately.
 *
 * On first login, AuthContext triggers a background populate.
 * Pages call loadWorkshopData() → get local data (may be empty on very
 * first load) → SyncContext populate finishes in background → pages
 * re-fetch via the onDataReady callback or a short poll.
 */

import { supabase } from "./supabase";
import * as local from "./local-repo";
import { getDb } from "./local-db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

export async function getCurrentUserId() {
  try {
    if (!supabase) return null;
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

async function isLocalPopulated() {
  try {
    const db = getDb();
    const [cCount, bCount] = await Promise.all([
      db.customers.count(),
      db.bills.count(),
    ]);
    return cCount > 0 || bCount > 0;
  } catch {
    return false;
  }
}

function isOnline() {
  return typeof navigator !== "undefined" ? navigator.onLine : false;
}

// ─── loadWorkshopData ─────────────────────────────────────────────────────────
// Always reads from IndexedDB immediately — never blocks on network.

export async function loadWorkshopData() {
  return await local.loadWorkshopData();
}

export async function fetchBillItemsByBillId(billId) {
  return local.fetchBillItemsByBillId(billId);
}

// ─── populateIfEmpty ──────────────────────────────────────────────────────────
// Called by AuthContext after login. Runs in background — does NOT block UI.
// Returns true if a populate was triggered (caller can re-fetch data after).

export async function populateIfEmpty(userId) {
  if (!userId || !isOnline()) return false;
  const populated = await isLocalPopulated();
  if (populated) return false; // already have data

  try {
    const { initialPopulate } = await import("./sync-engine");
    await initialPopulate(userId);
    return true;
  } catch (err) {
    console.warn("[data-layer] populateIfEmpty failed:", err.message);
    // Last-resort direct cloud fetch into local
    try {
      const { loadWorkshopData: cloudLoad } = await import("./workshop-data");
      const data = await cloudLoad();
      // Store cloud results into IndexedDB manually
      await _storeCloudDataLocally(data, userId);
      return true;
    } catch (e2) {
      console.warn("[data-layer] direct cloud fallback also failed:", e2.message);
      return false;
    }
  }
}

// ─── _storeCloudDataLocally ───────────────────────────────────────────────────
// Emergency fallback: if sync-engine fails, store raw Supabase rows directly.

async function _storeCloudDataLocally(data, userId) {
  const db  = getDb();
  const { syncedRow } = await import("./local-db");
  const ts  = new Date().toISOString();

  const store = async (table, rows) => {
    if (!rows?.length) return;
    await db.transaction("rw", db[table], async () => {
      for (const row of rows) {
        await db[table].put(syncedRow({ ...row, is_deleted: 0 }, row.updated_at || ts));
      }
    });
  };

  await store("customers",         data.customers);
  await store("vehicles",          data.vehicles);
  await store("bills",             data.bills);
  await store("bill_items",        data.billItems);
  await store("business_profile",  data.profile ? [data.profile] : []);
}

// ─── Customers ────────────────────────────────────────────────────────────────

export async function saveCustomerWithVehicles({ customer, vehicles }) {
  const userId = await getCurrentUserId();
  const result = await local.saveCustomerWithVehicles({ customer, vehicles, userId });
  _triggerSync();
  return result;
}

export async function updateCustomer(customer) {
  const result = await local.updateCustomer(customer);
  _triggerSync();
  return result;
}

// ─── Vehicles ─────────────────────────────────────────────────────────────────

export async function saveVehicle(vehicle, isEditing) {
  const userId = await getCurrentUserId();
  const result = await local.saveVehicle(vehicle, isEditing, userId);
  _triggerSync();
  return result;
}

// ─── Bills ────────────────────────────────────────────────────────────────────

export async function saveBillWithItems({ bill, items, isEditing }) {
  const userId = await getCurrentUserId();
  const result = await local.saveBillWithItems({ bill, items, isEditing, userId });
  _triggerSync();
  return result;
}

export async function deleteBill(billId) {
  await local.deleteBill(billId);
  _triggerSync();
}

export async function deleteCustomer(customerId) {
  await local.deleteCustomer(customerId);
  _triggerSync();
}

export async function deleteVehicle(vehicleId) {
  await local.deleteVehicle(vehicleId);
  _triggerSync();
}

// ─── Profile ─────────────────────────────────────────────────────────────────

export async function loadProfile() {
  const userId = await getCurrentUserId();
  return local.loadProfile(userId || "");
}

export async function saveProfile(profile) {
  const userId = await getCurrentUserId();
  const result = await local.saveProfile(profile, userId || "");
  _triggerSync();
  return result;
}

// ─── Workers ─────────────────────────────────────────────────────────────────

export async function loadWorkers() {
  return local.loadWorkers();
}

export async function saveWorker(worker) {
  const result = await local.saveWorker(worker);
  _triggerSync();
  return result;
}

// ─── Salary records ───────────────────────────────────────────────────────────

export async function loadSalaryRecords() {
  return local.loadSalaryRecords();
}

export async function saveSalaryRecord(record) {
  const result = await local.saveSalaryRecord(record);
  _triggerSync();
  return result;
}

// ─── PDF cache ────────────────────────────────────────────────────────────────

export { storePdfLocally, getPdfFromCache } from "./local-repo";

// ─── isSupabaseReady (backward compat) ───────────────────────────────────────

export { isSupabaseReady } from "./workshop-data";

// ─── Paginated loaders ────────────────────────────────────────────────────────

export { loadBillsPaginated, loadCustomersPaginated } from "./workshop-data";

// ─── Internal: fire-and-forget sync ───────────────────────────────────────────

function _triggerSync() {
  if (!isOnline()) return;
  import("./sync-engine")
    .then(({ runSync }) => runSync())
    .catch(console.warn);
}
