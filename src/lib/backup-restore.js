import {
  loadWorkshopData,
  loadWorkers,
  loadSalaryRecords,
  loadProfile,
  invalidateCache,
} from "./data-layer";
import { supabase } from "./supabase";
import { syncedRow, pendingRow, QUEUE_OP } from "./local-db";
import { toServerPayload } from "./sync-engine";

/**
 * Checks if running inside a browser environment with IndexedDB.
 */
function isBrowser() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

/**
 * Fetches the current authenticated user's ID from Supabase (if logged in).
 */
async function getCurrentUserId() {
  try {
    if (!supabase) return null;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Generates a full structured backup of the current database.
 */
export async function generateBackupData() {
  const [workshopData, workers, salaryRecords, profile] = await Promise.all([
    loadWorkshopData().catch(() => ({ customers: [], vehicles: [], bills: [], billItems: [] })),
    loadWorkers().catch(() => []),
    loadSalaryRecords().catch(() => []),
    loadProfile().catch(() => null),
  ]);

  const customers = workshopData?.customers || [];
  const vehicles = workshopData?.vehicles || [];
  const bills = workshopData?.bills || [];
  const billItems = workshopData?.billItems || [];

  const summary = {
    customers: customers.length,
    vehicles: vehicles.length,
    bills: bills.length,
    bill_items: billItems.length,
    workers: workers.length,
    salary_records: salaryRecords.length,
    has_profile: Boolean(profile),
  };

  return {
    meta: {
      app: "Cars - Business Management System",
      format: "cars-backup-v1",
      version: "1.0",
      exported_at: new Date().toISOString(),
      summary,
    },
    data: {
      business_profile: profile || null,
      customers,
      vehicles,
      bills,
      bill_items: billItems,
      workers,
      salary_records: salaryRecords,
    },
  };
}

/**
 * Downloads a timestamped JSON backup file to the client machine.
 */
export async function downloadBackupFile() {
  const backup = await generateBackupData();
  const jsonStr = JSON.stringify(backup, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const filename = `cars-backup-${timestamp}.json`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return {
    filename,
    summary: backup.meta.summary,
    exported_at: backup.meta.exported_at,
  };
}

/**
 * Parses and validates raw JSON text from an uploaded backup file.
 */
export function parseAndValidateBackup(fileText) {
  let parsed;
  try {
    parsed = JSON.parse(fileText);
  } catch (err) {
    return {
      valid: false,
      error: "Invalid JSON format: " + err.message,
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      valid: false,
      error: "Backup file is empty or corrupted.",
    };
  }

  // Extract data block (supports both wrapped { meta, data } and flat formats)
  const rawData = parsed.data && typeof parsed.data === "object" ? parsed.data : parsed;

  const customers = Array.isArray(rawData.customers) ? rawData.customers : [];
  const vehicles = Array.isArray(rawData.vehicles) ? rawData.vehicles : [];
  const bills = Array.isArray(rawData.bills) ? rawData.bills : [];
  const billItems = Array.isArray(rawData.bill_items)
    ? rawData.bill_items
    : Array.isArray(rawData.billItems)
    ? rawData.billItems
    : [];
  const workers = Array.isArray(rawData.workers) ? rawData.workers : [];
  const salaryRecords = Array.isArray(rawData.salary_records)
    ? rawData.salary_records
    : Array.isArray(rawData.salaryRecords)
    ? rawData.salaryRecords
    : [];
  const businessProfile =
    rawData.business_profile && typeof rawData.business_profile === "object"
      ? rawData.business_profile
      : null;

  const totalRecords =
    customers.length +
    vehicles.length +
    bills.length +
    billItems.length +
    workers.length +
    salaryRecords.length +
    (businessProfile ? 1 : 0);

  if (totalRecords === 0) {
    return {
      valid: false,
      error: "No recognizable Cars BMS records found in this backup file.",
    };
  }

  const summary = {
    customers: customers.length,
    vehicles: vehicles.length,
    bills: bills.length,
    bill_items: billItems.length,
    workers: workers.length,
    salary_records: salaryRecords.length,
    has_profile: Boolean(businessProfile),
    total_records: totalRecords,
  };

  return {
    valid: true,
    meta: parsed.meta || {
      exported_at: parsed.exported_at || "Unknown",
      app: "Cars - Business Management System",
      version: parsed.version || "1.0",
    },
    summary,
    data: {
      business_profile: businessProfile,
      customers,
      vehicles,
      bills,
      bill_items: billItems,
      workers,
      salary_records: salaryRecords,
    },
  };
}

/**
 * Restores data from validated backup data.
 * @param {Object} options
 * @param {Object} options.backupData - The validated data object.
 * @param {"merge" | "clean"} options.mode - "merge" to upsert, "clean" to wipe and replace.
 * @param {Function} [options.onProgress] - Optional status message callback.
 */
export async function restoreBackupData({ backupData, mode = "merge", onProgress }) {
  if (!backupData || typeof backupData !== "object") {
    throw new Error("Invalid backup data provided for restore.");
  }

  const userId = await getCurrentUserId();
  const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
  const isSupabaseConfigured = Boolean(supabase) && Boolean(userId);

  onProgress?.("Preparing database for restoration...");

  let localDb = null;
  if (isBrowser()) {
    const { getDb } = await import("./local-db");
    localDb = getDb();
  }

  // ── Clean mode: delete existing records for this user ─────────────────────
  if (mode === "clean") {
    onProgress?.("Cleaning existing records...");

    if (localDb) {
      const { wipeUserData } = await import("./local-repo");
      await wipeUserData(userId);
    }

    if (isSupabaseConfigured && isOnline) {
      try {
        // Reverse foreign key order for clean cascade
        await supabase.from("bill_items").delete().eq("user_id", userId);
        await supabase.from("bills").delete().eq("user_id", userId);
        await supabase.from("vehicles").delete().eq("user_id", userId);
        await supabase.from("customers").delete().eq("user_id", userId);
        await supabase.from("salary_records").delete().eq("user_id", userId);
        await supabase.from("workers").delete().eq("user_id", userId);
      } catch (err) {
        console.warn("[restore] Cloud clean error (continuing):", err.message);
      }
    }
  }

  const nowTs = new Date().toISOString();

  // ── 1. Restore Business Profile ───────────────────────────────────────────
  if (backupData.business_profile) {
    onProgress?.("Restoring business profile...");
    const profileRow = {
      ...backupData.business_profile,
      user_id: userId || backupData.business_profile.user_id || null,
      updated_at: nowTs,
    };

    if (localDb) {
      await localDb.business_profile.put(syncedRow(profileRow, nowTs)).catch(() => {});
    }

    if (isSupabaseConfigured && isOnline) {
      const serverPayload = toServerPayload(profileRow, "business_profile", userId);
      await supabase
        .from("business_profile")
        .upsert(serverPayload, { onConflict: "id" })
        .catch((e) => console.warn("[restore] Profile cloud upsert error:", e.message));
    }
  }

  // ── Helper to restore a table ─────────────────────────────────────────────
  const restoreTable = async (tableName, rows, fkCleanFn = null) => {
    if (!rows || rows.length === 0) return;
    onProgress?.(`Restoring ${tableName} (${rows.length} records)...`);

    const stampedRows = rows.map((r) => {
      const rowCopy = {
        ...r,
        user_id: userId || r.user_id || null,
        updated_at: r.updated_at || nowTs,
        created_at: r.created_at || nowTs,
      };
      if (fkCleanFn) fkCleanFn(rowCopy);
      return rowCopy;
    });

    // Write to IndexedDB
    if (localDb) {
      const localRows = stampedRows.map((r) => syncedRow(r, r.updated_at));
      await localDb.transaction("rw", localDb[tableName], async () => {
        await localDb[tableName].bulkPut(localRows);
      });
    }

    // Write to Supabase Cloud if authenticated and online
    if (isSupabaseConfigured && isOnline) {
      const CHUNK_SIZE = 250;
      for (let i = 0; i < stampedRows.length; i += CHUNK_SIZE) {
        const chunk = stampedRows.slice(i, i + CHUNK_SIZE);
        const serverPayloads = chunk.map((r) => toServerPayload(r, tableName, userId));
        const { error } = await supabase
          .from(tableName)
          .upsert(serverPayloads, { onConflict: "id" });
        if (error) {
          console.warn(`[restore] Cloud upsert error on ${tableName}:`, error.message);
        }
      }
    }
  };

  // ── Foreign-Key Ordered Restoration ───────────────────────────────────────
  // 1. Customers
  await restoreTable("customers", backupData.customers);

  // 2. Vehicles
  await restoreTable("vehicles", backupData.vehicles);

  // 3. Bills
  await restoreTable("bills", backupData.bills);

  // 4. Bill Line Items
  await restoreTable("bill_items", backupData.bill_items);

  // 5. Workers
  await restoreTable("workers", backupData.workers);

  // 6. Salary Records
  await restoreTable("salary_records", backupData.salary_records);

  // ── Post-Restore Invalidation & Sync ──────────────────────────────────────
  onProgress?.("Finalizing restored data...");
  invalidateCache();

  if (isOnline) {
    try {
      const { runSync } = await import("./sync-engine");
      runSync().catch(() => {});
    } catch {
      // Sync engine run optional
    }
  }

  return {
    success: true,
    summary: {
      customers: backupData.customers?.length || 0,
      vehicles: backupData.vehicles?.length || 0,
      bills: backupData.bills?.length || 0,
      bill_items: backupData.bill_items?.length || 0,
      workers: backupData.workers?.length || 0,
      salary_records: backupData.salary_records?.length || 0,
      has_profile: Boolean(backupData.business_profile),
    },
  };
}

