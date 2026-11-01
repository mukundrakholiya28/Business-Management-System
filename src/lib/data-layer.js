/**
 * data-layer.js — Unified data access layer
 * ─────────────────────────────────────────────────────────────────────────────
 * Rules:
 *  1. Pages are "use client" — but Next.js can still evaluate imports on the
 *     server during static generation. This file must never call IndexedDB
 *     at module-evaluation time (i.e. only inside async functions).
 *
 *  2. loadWorkshopData() always returns immediately:
 *     - Browser + IndexedDB populated → return local data
 *     - Browser + IndexedDB empty     → return local (empty); background populate fires
 *     - Server / SSR / no IndexedDB   → direct Supabase fetch (original behaviour)
 *
 *  3. Writes go to IndexedDB first, then sync async to Supabase.
 */

import { supabase } from "./supabase";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isBrowser() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function isOnline() {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

async function getCurrentUserId() {
  try {
    if (!supabase) return null;
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

async function getLocalDb() {
  if (!isBrowser()) return null;
  const { getDb } = await import("./local-db");
  return getDb();
}

async function isLocalPopulated() {
  try {
    const db = await getLocalDb();
    if (!db) return false;
    const [c, b] = await Promise.all([db.customers.count(), db.bills.count()]);
    return c > 0 || b > 0;
  } catch {
    return false;
  }
}

// ─── loadWorkshopData ─────────────────────────────────────────────────────────

export async function loadWorkshopData() {
  // Not in browser (SSR) → go straight to Supabase
  if (!isBrowser()) {
    const { loadWorkshopData: cloudLoad } = await import("./workshop-data");
    return cloudLoad();
  }

  // In browser — try local first
  try {
    const { loadWorkshopData: localLoad } = await import("./local-repo");
    return await localLoad();
  } catch (err) {
    console.warn("[data-layer] local read failed, falling back to Supabase:", err.message);
    const { loadWorkshopData: cloudLoad } = await import("./workshop-data");
    return cloudLoad();
  }
}

export async function fetchBillItemsByBillId(billId) {
  if (!isBrowser()) {
    const { fetchBillItemsByBillId: cloudFetch } = await import("./workshop-data");
    return cloudFetch(billId);
  }
  try {
    const { fetchBillItemsByBillId: localFetch } = await import("./local-repo");
    return await localFetch(billId);
  } catch {
    const { fetchBillItemsByBillId: cloudFetch } = await import("./workshop-data");
    return cloudFetch(billId);
  }
}

// ─── populateIfEmpty ──────────────────────────────────────────────────────────
// Called by AuthContext after login — non-blocking, browser only.

export async function populateIfEmpty(userId) {
  if (!isBrowser() || !userId || !isOnline()) return false;
  const populated = await isLocalPopulated();
  if (populated) return false;

  try {
    const { initialPopulate } = await import("./sync-engine");
    await initialPopulate(userId);
    return true;
  } catch (err) {
    console.warn("[data-layer] initialPopulate failed:", err.message);
    // Emergency fallback: pull cloud data directly into IndexedDB
    try {
      const { loadWorkshopData: cloudLoad } = await import("./workshop-data");
      const data = await cloudLoad();
      await _storeCloudDataLocally(data, userId);
      return true;
    } catch (e2) {
      console.warn("[data-layer] emergency fallback also failed:", e2.message);
      return false;
    }
  }
}

async function _storeCloudDataLocally(data, userId) {
  const db = await getLocalDb();
  if (!db) return;
  const { syncedRow } = await import("./local-db");
  const ts = new Date().toISOString();

  const storeTable = async (tableName, rows) => {
    if (!rows?.length || !db[tableName]) return;
    await db.transaction("rw", db[tableName], async () => {
      for (const row of rows) {
        await db[tableName].put(syncedRow({ ...row, is_deleted: 0 }, row.updated_at || ts));
      }
    });
  };

  await storeTable("customers",        data.customers  || []);
  await storeTable("vehicles",         data.vehicles   || []);
  await storeTable("bills",            data.bills      || []);
  await storeTable("bill_items",       data.billItems  || []);
}

// ─── Customers ────────────────────────────────────────────────────────────────

export async function saveCustomerWithVehicles({ customer, vehicles }) {
  const userId = await getCurrentUserId();
  if (!isBrowser()) {
    const { saveCustomerWithVehicles: c } = await import("./workshop-data");
    return c({ customer, vehicles });
  }
  const { saveCustomerWithVehicles: localSave } = await import("./local-repo");
  const result = await localSave({ customer, vehicles, userId });
  _triggerSync();
  return result;
}

export async function updateCustomer(customer) {
  if (!isBrowser()) {
    const { updateCustomer: c } = await import("./workshop-data");
    return c(customer);
  }
  const { updateCustomer: localUpdate } = await import("./local-repo");
  const result = await localUpdate(customer);
  _triggerSync();
  return result;
}

// ─── Vehicles ─────────────────────────────────────────────────────────────────

export async function saveVehicle(vehicle, isEditing) {
  const userId = await getCurrentUserId();
  if (!isBrowser()) {
    const { saveVehicle: c } = await import("./workshop-data");
    return c(vehicle, isEditing);
  }
  const { saveVehicle: localSave } = await import("./local-repo");
  const result = await localSave(vehicle, isEditing, userId);
  _triggerSync();
  return result;
}

// ─── Bills ────────────────────────────────────────────────────────────────────

export async function saveBillWithItems({ bill, items, isEditing }) {
  const userId = await getCurrentUserId();
  if (!isBrowser()) {
    const { saveBillWithItems: c } = await import("./workshop-data");
    return c({ bill, items, isEditing });
  }
  const { saveBillWithItems: localSave } = await import("./local-repo");
  const result = await localSave({ bill, items, isEditing, userId });
  _triggerSync();
  return result;
}

export async function deleteBill(billId) {
  if (!isBrowser()) {
    const { deleteBill: c } = await import("./workshop-data");
    return c(billId);
  }
  const { deleteBill: localDel } = await import("./local-repo");
  await localDel(billId);
  _triggerSync();
}

export async function deleteCustomer(customerId) {
  if (!isBrowser()) {
    const { deleteCustomer: c } = await import("./workshop-data");
    return c(customerId);
  }
  const { deleteCustomer: localDel } = await import("./local-repo");
  await localDel(customerId);
  _triggerSync();
}

export async function deleteVehicle(vehicleId) {
  if (!isBrowser()) {
    const { deleteVehicle: c } = await import("./workshop-data");
    return c(vehicleId);
  }
  const { deleteVehicle: localDel } = await import("./local-repo");
  await localDel(vehicleId);
  _triggerSync();
}

// ─── Profile ─────────────────────────────────────────────────────────────────

export async function loadProfile() {
  if (!isBrowser()) {
    const { loadProfile: c } = await import("./workshop-data");
    return c();
  }
  const userId = await getCurrentUserId();
  try {
    const { loadProfile: localLoad } = await import("./local-repo");
    return await localLoad(userId || "");
  } catch {
    const { loadProfile: c } = await import("./workshop-data");
    return c();
  }
}

export async function saveProfile(profile) {
  const userId = await getCurrentUserId();
  if (!isBrowser()) {
    const { saveProfile: c } = await import("./workshop-data");
    return c(profile);
  }
  const { saveProfile: localSave } = await import("./local-repo");
  const result = await localSave(profile, userId || "");
  _triggerSync();
  return result;
}

// ─── Workers ─────────────────────────────────────────────────────────────────

export async function loadWorkers() {
  if (!isBrowser()) {
    const { loadWorkers: c } = await import("./workshop-data");
    return c();
  }
  try {
    const { loadWorkers: localLoad } = await import("./local-repo");
    return await localLoad();
  } catch {
    const { loadWorkers: c } = await import("./workshop-data");
    return c();
  }
}

export async function saveWorker(worker) {
  if (!isBrowser()) {
    const { saveWorker: c } = await import("./workshop-data");
    return c(worker);
  }
  const { saveWorker: localSave } = await import("./local-repo");
  const result = await localSave(worker);
  _triggerSync();
  return result;
}

// ─── Salary records ───────────────────────────────────────────────────────────

export async function loadSalaryRecords() {
  if (!isBrowser()) {
    const { loadSalaryRecords: c } = await import("./workshop-data");
    return c();
  }
  try {
    const { loadSalaryRecords: localLoad } = await import("./local-repo");
    return await localLoad();
  } catch {
    const { loadSalaryRecords: c } = await import("./workshop-data");
    return c();
  }
}

export async function saveSalaryRecord(record) {
  if (!isBrowser()) {
    const { saveSalaryRecord: c } = await import("./workshop-data");
    return c(record);
  }
  const { saveSalaryRecord: localSave } = await import("./local-repo");
  const result = await localSave(record);
  _triggerSync();
  return result;
}

// ─── PDF cache ────────────────────────────────────────────────────────────────

export async function storePdfLocally(bill, pdfBlob) {
  if (!isBrowser()) return;
  const { storePdfLocally: localStore } = await import("./local-repo");
  return localStore(bill, pdfBlob);
}

export async function getPdfFromCache(billId) {
  if (!isBrowser()) return null;
  const { getPdfFromCache: localGet } = await import("./local-repo");
  return localGet(billId);
}

// ─── isSupabaseReady (backward compat) ───────────────────────────────────────

export { isSupabaseReady } from "./workshop-data";

// ─── Paginated loaders ────────────────────────────────────────────────────────

export { loadBillsPaginated, loadCustomersPaginated } from "./workshop-data";

// ─── Internal: fire-and-forget sync ──────────────────────────────────────────

function _triggerSync() {
  if (!isBrowser() || !isOnline()) return;
  import("./sync-engine")
    .then(({ runSync }) => runSync())
    .catch(console.warn);
}
