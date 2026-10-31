/**
 * data-layer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified data access layer — offline-first.
 *
 * Priority order:
 *   1. If IndexedDB is populated → always read local (works 100% offline)
 *   2. If IndexedDB is empty + online → pull from Supabase, store locally, return local
 *   3. If IndexedDB is empty + offline → return empty arrays (no crash)
 *
 * Writes always go to IndexedDB immediately. Sync to Supabase happens async.
 */

import { supabase } from "./supabase";
import * as local from "./local-repo";
import { getDb } from "./local-db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getCurrentUserId() {
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

export async function loadWorkshopData() {
  const populated = await isLocalPopulated();

  if (!populated) {
    if (!isOnline()) {
      // Offline and no local data — return empty (first-ever use needs internet once)
      return { source: "empty", customers: [], vehicles: [], bills: [], billItems: [] };
    }
    // Online but empty — do initial populate from Supabase
    const userId = await getCurrentUserId();
    if (userId) {
      try {
        const { initialPopulate } = await import("./sync-engine");
        await initialPopulate(userId);
      } catch (err) {
        console.warn("[data-layer] initialPopulate failed, falling back to direct cloud fetch:", err.message);
        // Direct cloud fetch as last resort
        try {
          const { loadWorkshopData: cloudLoad } = await import("./workshop-data");
          return await cloudLoad();
        } catch {
          return { source: "empty", customers: [], vehicles: [], bills: [], billItems: [] };
        }
      }
    }
  }

  return await local.loadWorkshopData();
}

export async function fetchBillItemsByBillId(billId) {
  return local.fetchBillItemsByBillId(billId);
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

// ─── Paginated loaders (still cloud-only, used in no current page) ────────────

export { loadBillsPaginated, loadCustomersPaginated } from "./workshop-data";

// ─── Internal: fire-and-forget sync ───────────────────────────────────────────

function _triggerSync() {
  if (!isOnline()) return; // don't even try if offline
  import("./sync-engine")
    .then(({ runSync }) => runSync())
    .catch(console.warn);
}
