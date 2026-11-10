/**
 * local-repo.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Local-first CRUD layer backed by IndexedDB (Dexie).
 * All reads/writes go through here — Supabase is never touched from this file.
 *
 * Key design choices:
 *  • is_deleted = 0 (live) | 1 (soft-deleted) — avoids Dexie null-index issues
 *  • sync_queue deduplication uses simple entity_id + operation lookup via filter()
 *  • All public functions mirror workshop-data.js signatures exactly
 */

import { v4 as uuidv4 } from "uuid";
import Dexie from "dexie";
import {
  getDb,
  isIndexedDbAvailable,
  SYNC_STATUS,
  QUEUE_OP,
  QUEUE_STATUS,
  pendingRow,
  syncedRow,
} from "./local-db";
import { normalizePhoneNumber, generateId } from "./helpers";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

function newId() {
  return uuidv4();
}

/** Throws a clear error when called outside the browser. */
function requireBrowser() {
  if (!isIndexedDbAvailable()) {
    throw new Error("IndexedDB is not available outside the browser.");
  }
}

/** Returns all live (non-deleted) rows from a Dexie table. */
async function liveRows(table) {
  // Use the indexed is_deleted=0 path instead of a full-table filter scan
  return table.where("is_deleted").equals(0).toArray();
}

// ─── Sync queue ───────────────────────────────────────────────────────────────

/**
 * Enqueue a sync operation. Deduplicates by entity_id + operation.
 * If a pending CREATE exists and we are now queueing a DELETE, cancels the CREATE
 * (the entity never reached the server so no server-side delete is needed).
 */
async function enqueue(entityType, entityId, operation, payload = null) {
  const db  = getDb();
  const opId = newId();

  // Find any existing pending op for this entity + operation
  const allPending = await db.sync_queue
    .where("status")
    .equals(QUEUE_STATUS.PENDING)
    .filter((r) => r.entity_id === entityId)
    .toArray();

  const existingOp = allPending.find((r) => r.operation === operation);

  // If same op already queued — update payload only
  if (existingOp) {
    await db.sync_queue.update(existingOp._seq, {
      payload,
      created_at:        now(),
      retry_count:       0,
      last_attempted_at: null,
      error_message:     null,
    });
    return;
  }

  // DELETE cancels any pending CREATE (entity never reached server)
  if (operation === QUEUE_OP.DELETE) {
    const pendingCreate = allPending.find((r) => r.operation === QUEUE_OP.CREATE);
    if (pendingCreate) {
      await db.sync_queue.delete(pendingCreate._seq);
      return; // No server delete needed — entity was local-only
    }
  }

  // UPDATE can collapse into a pending CREATE (update the payload, not add a new op)
  if (operation === QUEUE_OP.UPDATE) {
    const pendingCreate = allPending.find((r) => r.operation === QUEUE_OP.CREATE);
    if (pendingCreate) {
      await db.sync_queue.update(pendingCreate._seq, {
        payload,
        created_at:        now(),
        retry_count:       0,
        last_attempted_at: null,
        error_message:     null,
      });
      return;
    }
  }

  await db.sync_queue.add({
    op_id:             opId,
    entity_type:       entityType,
    entity_id:         entityId,
    operation,
    payload,
    status:            QUEUE_STATUS.PENDING,
    created_at:        now(),
    retry_count:       0,
    last_attempted_at: null,
    error_message:     null,
  });
}

// ─── isLocalReady ─────────────────────────────────────────────────────────────

export function isLocalReady() {
  try {
    return typeof indexedDB !== "undefined";
  } catch {
    return false;
  }
}

// ─── loadWorkshopData ─────────────────────────────────────────────────────────

export async function loadWorkshopData() {
  requireBrowser();
  const db = getDb();

  // Run cleanup migrations asynchronously in background
  cleanupDuplicateBills(db).catch(() => {});
  cleanupOrphanQueueOps(db).catch(() => {});

  // All four queries run in parallel using indexed is_deleted=0
  const [customers, vehicles, rawBills, rawBillItems] = await Promise.all([
    db.customers.where("is_deleted").equals(0).toArray(),
    db.vehicles.where("is_deleted").equals(0).toArray(),
    db.bills.where("is_deleted").equals(0).toArray(),
    db.bill_items.where("is_deleted").equals(0).toArray(),
  ]);

  // Sort bills DESC by bill_number (most recent first)
  rawBills.sort((a, b) => (b.bill_number ?? 0) - (a.bill_number ?? 0));

  // Deduplicate in-memory by bill_number and ID so the UI NEVER sees duplicate invoices
  const seenBillNumbers = new Set();
  const seenBillIds = new Set();
  const bills = [];
  for (const b of rawBills) {
    if (seenBillIds.has(b.id)) continue;
    seenBillIds.add(b.id);

    if (b.bill_number != null && b.bill_number > 0) {
      if (seenBillNumbers.has(b.bill_number)) continue;
      seenBillNumbers.add(b.bill_number);
    }
    bills.push(b);
  }

  // Deduplicate bill items:
  const seenItemKeys = new Set();
  const billItems = [];
  for (const item of rawBillItems) {
    const key = `${item.bill_id}_${item.sort_order ?? 0}_${item.description}`;
    if (seenItemKeys.has(key)) continue;
    seenItemKeys.add(key);
    billItems.push(item);
  }

  // Sort items by sort_order within each bill
  billItems.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return {
    source:    "local",
    customers,
    vehicles,
    bills,
    billItems,
  };
}

// ─── fetchBillItemsByBillId ───────────────────────────────────────────────────

export async function fetchBillItemsByBillId(billId) {
  if (!billId) return [];
  requireBrowser();
  const db = getDb();
  // Use compound index [bill_id, sort_order] for fast sorted retrieval
  const items = await db.bill_items
    .where("[bill_id+sort_order]")
    .between([billId, Dexie.minKey], [billId, Dexie.maxKey])
    .filter((i) => !i.is_deleted)
    .toArray()
    .catch(() =>
      // Fallback if compound index not available
      db.bill_items
        .where("bill_id").equals(billId)
        .filter((i) => !i.is_deleted)
        .toArray()
    );
  return items.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

// ─── saveCustomerWithVehicles ─────────────────────────────────────────────────

export async function saveCustomerWithVehicles({ customer, vehicles, userId }) {
  const db = getDb();
  const ts = now();

  const phone = normalizePhoneNumber(customer?.phone_number || "");
  if (phone) {
    const dup = await db.customers
      .where("phone_number")
      .equals(phone)
      .filter((c) => !c.is_deleted)
      .first();
    if (dup) throw new Error("Customer already exists with this phone number.");
  }

  const validVehicles = (vehicles || []).filter(
    (v) => v.vehicle_number?.trim() || v.make?.trim() || v.model?.trim() || v.year || v.color?.trim()
  );

  for (const v of validVehicles) {
    const num = v.vehicle_number?.trim().toUpperCase();
    if (num) {
      const dup = await db.vehicles
        .where("vehicle_number")
        .equals(num)
        .filter((x) => !x.is_deleted)
        .first();
      if (dup) throw new Error(`Vehicle number ${num} is already registered.`);
    }
  }

  const customerId = customer.id || newId();
  const customerRow = pendingRow({
    id:           customerId,
    user_id:      userId,
    name:         customer.name?.trim() || "",
    phone_number: phone,
    email:        customer.email?.trim()   || null,
    address:      customer.address?.trim() || null,
    created_at:   ts,
    updated_at:   ts,
  });

  const createdVehicles = [];

  await db.transaction("rw", db.customers, db.vehicles, db.sync_queue, async () => {
    await db.customers.put(customerRow);
    await enqueue("customers", customerId, QUEUE_OP.CREATE, customerRow);

    for (let i = 0; i < validVehicles.length; i++) {
      const v          = validVehicles[i];
      const vehicleId  = v.id || newId();
      const vehicleRow = pendingRow({
        id:             vehicleId,
        customer_id:    customerId,
        user_id:        userId,
        vehicle_number: v.vehicle_number?.trim()
          ? v.vehicle_number.trim().toUpperCase()
          : `TEMP-${generateId()}`,
        make:       v.make?.trim()  || null,
        model:      v.model?.trim() || null,
        year:       v.year ? Number(v.year) : null,
        color:      v.color?.trim() || null,
        created_at: ts,
        updated_at: ts,
      });
      await db.vehicles.put(vehicleRow);
      await enqueue("vehicles", vehicleId, QUEUE_OP.CREATE, vehicleRow);
      createdVehicles.push(vehicleRow);
    }
  });

  return { customer: customerRow, vehicles: createdVehicles };
}

// ─── updateCustomer ───────────────────────────────────────────────────────────

export async function updateCustomer(customer) {
  if (!customer?.id) throw new Error("Customer ID is required.");
  const db       = getDb();
  const existing = await db.customers.get(customer.id);
  if (!existing) throw new Error("Customer not found.");

  const updated = pendingRow({
    ...existing,
    name:         customer.name,
    phone_number: normalizePhoneNumber(customer.phone_number),
    email:        customer.email   ?? null,
    address:      customer.address ?? null,
    updated_at:   now(),
  });

  await db.transaction("rw", db.customers, db.sync_queue, async () => {
    await db.customers.put(updated);
    await enqueue("customers", customer.id, QUEUE_OP.UPDATE, updated);
  });

  return updated;
}

// ─── saveVehicle ──────────────────────────────────────────────────────────────

export async function saveVehicle(vehicle, isEditing, userId) {
  const db = getDb();
  if (!vehicle.customer_id) throw new Error("Customer ID is required.");

  const cleanNumber = vehicle.vehicle_number?.trim()
    ? vehicle.vehicle_number.trim().toUpperCase()
    : "";

  if (cleanNumber && (!isEditing || cleanNumber !== vehicle.original_vehicle_number)) {
    const dup = await db.vehicles
      .where("vehicle_number")
      .equals(cleanNumber)
      .filter((v) => !v.is_deleted)
      .first();
    if (dup && (!isEditing || dup.id !== vehicle.id)) {
      throw new Error(`Vehicle number ${cleanNumber} is already registered.`);
    }
  }

  const ts = now();

  if (isEditing) {
    const existing = await db.vehicles.get(vehicle.id);
    if (!existing) throw new Error("Vehicle not found.");

    const updated = pendingRow({
      ...existing,
      customer_id:    vehicle.customer_id,
      vehicle_number: cleanNumber || `TEMP-${generateId()}`,
      make:           vehicle.make?.trim()  || null,
      model:          vehicle.model?.trim() || null,
      year:           vehicle.year ? Number(vehicle.year) : null,
      color:          vehicle.color?.trim() || null,
      updated_at:     ts,
    });

    await db.transaction("rw", db.vehicles, db.sync_queue, async () => {
      await db.vehicles.put(updated);
      await enqueue("vehicles", vehicle.id, QUEUE_OP.UPDATE, updated);
    });
    return updated;
  }

  const vehicleId = newId();
  const row = pendingRow({
    id:             vehicleId,
    customer_id:    vehicle.customer_id,
    user_id:        userId,
    vehicle_number: cleanNumber || `TEMP-${generateId()}`,
    make:           vehicle.make?.trim()  || null,
    model:          vehicle.model?.trim() || null,
    year:           vehicle.year ? Number(vehicle.year) : null,
    color:          vehicle.color?.trim() || null,
    created_at:     ts,
    updated_at:     ts,
  });

  await db.transaction("rw", db.vehicles, db.sync_queue, async () => {
    await db.vehicles.put(row);
    await enqueue("vehicles", vehicleId, QUEUE_OP.CREATE, row);
  });
  return row;
}

// ─── saveBillWithItems ────────────────────────────────────────────────────────

export async function saveBillWithItems({ bill, items, isEditing, userId }) {
  const db = getDb();
  const ts = now();

  // ── Walk-in customer ──────────────────────────────────────────────────────
  let customerId = bill.customer_id;
  let vehicleId  = bill.vehicle_id;

  if (!customerId) {
    const walkIn = await db.customers
      .where("phone_number")
      .equals("910000000000")
      .filter((c) => !c.is_deleted)
      .first();

    if (walkIn) {
      customerId = walkIn.id;
    } else {
      customerId = newId();
      const wc = pendingRow({
        id: customerId, user_id: userId,
        name: "Walk-in Customer", phone_number: "910000000000",
        email: null, address: null, created_at: ts, updated_at: ts,
      });
      await db.customers.put(wc);
      await enqueue("customers", customerId, QUEUE_OP.CREATE, wc);
    }
  }

  if (!vehicleId) {
    const walkInV = await db.vehicles
      .where("customer_id")
      .equals(customerId)
      .filter((v) => v.vehicle_number === "WALK-IN" && !v.is_deleted)
      .first();

    if (walkInV) {
      vehicleId = walkInV.id;
    } else {
      vehicleId = newId();
      const wv = pendingRow({
        id: vehicleId, customer_id: customerId, user_id: userId,
        vehicle_number: "WALK-IN", make: "General", model: "Vehicle",
        year: null, color: null, created_at: ts, updated_at: ts,
      });
      await db.vehicles.put(wv);
      await enqueue("vehicles", vehicleId, QUEUE_OP.CREATE, wv);
    }
  }

  // ── Financial calculation ─────────────────────────────────────────────────
  const itemsProvided = items !== undefined && items !== null;
  let subtotal     = Number(bill.subtotal     || 0);
  let discount     = Number(bill.discount     || 0);
  let tax_amount   = Number(bill.tax_amount   || 0);
  let total_amount = Number(bill.total_amount || 0);
  let cleanItems   = [];

  if (itemsProvided) {
    if (!Array.isArray(items)) throw new Error("Invalid items format.");
    subtotal = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.description?.trim()) continue;
      const qty   = Math.max(0, Number(item.quantity   || 0));
      const price = Math.max(0, Number(item.unit_price || 0));
      const total = Math.round(qty * price * 100) / 100;
      subtotal += total;
      cleanItems.push({
        description: item.description.trim(),
        quantity: qty, unit_price: price,
        total_price: total, sort_order: i,
      });
    }

    subtotal     = Math.round(subtotal * 100) / 100;
    discount     = Math.max(0, Math.min(Number(bill.discount || 0), subtotal));
    const taxable = Math.max(0, subtotal - discount);
    const gstRate = bill.gst_enabled ? Number(bill.gst_rate ?? 18) : 0;
    tax_amount   = Math.round(taxable * (gstRate / 100) * 100) / 100;
    total_amount = Math.round((taxable + tax_amount) * 100) / 100;
  }

  // ── Status / paid alignment ───────────────────────────────────────────────
  let status      = bill.status;
  let paid_amount = Number(bill.paid_amount || 0);

  if (status === "paid") {
    paid_amount = total_amount;
  } else if (status === "pending" || status === "draft" || status === "cancelled") {
    paid_amount = 0;
  } else if (status === "partially_paid") {
    if (paid_amount <= 0) { paid_amount = 0; status = "pending"; }
    else if (paid_amount >= total_amount) { paid_amount = total_amount; status = "paid"; }
  }

  // ── Payment history ───────────────────────────────────────────────────────
  let payment_history = Array.isArray(bill.payment_history) ? [...bill.payment_history] : [];

  if (isEditing && !itemsProvided) {
    const currentBill = await db.bills.get(bill.id);
    if (currentBill) {
      const currentPaid = Number(currentBill.paid_amount || 0);
      const nextPaid    = Number(paid_amount);
      const hist        = Array.isArray(currentBill.payment_history)
        ? [...currentBill.payment_history] : [];

      if (nextPaid !== currentPaid) {
        if (nextPaid > currentPaid) {
          hist.push({ date: ts, amount: nextPaid - currentPaid, method: bill.payment_method || "cash" });
          payment_history = hist;
        } else {
          payment_history = nextPaid > 0
            ? [{ date: ts, amount: nextPaid, method: bill.payment_method || "cash" }]
            : [];
        }
      } else {
        payment_history = hist;
      }
    }
  } else if (!isEditing && paid_amount > 0 && payment_history.length === 0) {
    payment_history = [{ date: ts, amount: paid_amount, method: bill.payment_method || "cash" }];
  }

  // ── Assign local bill_number ──────────────────────────────────────────────
  // Use an index query on user_id instead of full table scan
  let bill_number = bill.bill_number;
  if (!isEditing || !bill_number) {
    // Get just the bill_number column for this user, sorted DESC — much faster
    const topBill = await db.bills
      .where("user_id").equals(userId || "")
      .filter((b) => !b.is_deleted)
      .toArray()
      .then((rows) => rows.reduce((max, b) => Math.max(max, b.bill_number ?? 0), 0));
    bill_number = topBill + 1;
  }

  const billId = isEditing ? bill.id : (bill.id || newId());
  const existingBill = isEditing ? (await db.bills.get(billId) || {}) : {};

  const billRow = pendingRow({
    ...existingBill,
    id:             billId,
    bill_number,
    customer_id:    customerId,
    vehicle_id:     vehicleId,
    user_id:        userId,
    kms_run:        bill.kms_run ? Number(bill.kms_run) : null,
    subtotal,
    tax_amount,
    discount,
    total_amount,
    status,
    payment_method: bill.payment_method || null,
    paid_amount,
    notes:          bill.notes || null,
    pdf_url:        bill.pdf_url || null,
    payment_history,
    gst_enabled:    bill.gst_enabled ?? false,
    gst_rate:       bill.gst_rate ?? 18,
    created_at:     bill.created_at || ts,
    updated_at:     ts,
  });

  const itemRows = cleanItems.map((item, i) => {
    const existingItemId = items?.[i]?.id || newId();
    return pendingRow({
      id:          existingItemId,
      bill_id:     billId,
      user_id:     userId,
      description: item.description,
      quantity:    item.quantity,
      unit_price:  item.unit_price,
      total_price: item.total_price,
      sort_order:  item.sort_order,
      created_at:  ts,
    });
  });

  await db.transaction("rw", db.bills, db.bill_items, db.sync_queue, async () => {
    await db.bills.put(billRow);

    if (itemsProvided) {
      // Soft-delete old items
      const oldItems = await db.bill_items.where("bill_id").equals(billId).toArray();
      for (const old of oldItems) {
        await db.bill_items.put({ ...old, is_deleted: 1, sync_status: SYNC_STATUS.PENDING });
      }
      for (const row of itemRows) {
        await db.bill_items.put(row);
      }
    }

    await enqueue(
      "bills",
      billId,
      isEditing ? QUEUE_OP.UPDATE : QUEUE_OP.CREATE,
      { bill: billRow, items: itemsProvided ? itemRows : undefined }
    );
  });

  return { bill: billRow, items: itemsProvided ? itemRows : [] };
}

// ─── loadProfile ──────────────────────────────────────────────────────────────

export async function loadProfile(userId) {
  const db = getDb();
  if (userId) {
    const profile = await db.business_profile
      .filter((p) => p.user_id === userId && !p.is_deleted)
      .first();
    if (profile) return profile;
  }
  // Fallback to any active profile in the local database (offline resilience)
  const anyProfile = await db.business_profile
    .filter((p) => !p.is_deleted)
    .first();
  if (anyProfile) return anyProfile;

  return {
    id: null, name: "Cars",
    tagline: "", established: "",
    address: "", phone: "",
    email: "", gstin: "",
    payment_methods: "UPI / Bank Transfer / Cash",
    upi_id: "", bank_name: "", account_number: "", ifsc: "",
    invoice_notes: "Payment due within 7 days of invoice date.",
  };
}

// ─── saveProfile ──────────────────────────────────────────────────────────────

export async function saveProfile(profile, userId) {
  const db  = getDb();
  const ts  = now();
  const existing = await db.business_profile
    .filter((p) => (!p.is_deleted && (p.user_id === userId || !userId || !p.user_id)))
    .first();

  const row = pendingRow({
    ...(existing || {}),
    id:              existing?.id || profile.id || newId(),
    user_id:         userId,
    name:            profile.name,
    tagline:         profile.tagline,
    established:     profile.established,
    address:         profile.address,
    phone:           profile.phone,
    email:           profile.email,
    gstin:           profile.gstin            ?? "",
    payment_methods: profile.payment_methods,
    upi_id:          profile.upi_id           ?? "",
    bank_name:       profile.bank_name         ?? "",
    account_number:  profile.account_number    ?? "",
    ifsc:            profile.ifsc              ?? "",
    invoice_notes:   profile.invoice_notes     ?? "",
    created_at:      existing?.created_at || ts,
    updated_at:      ts,
  });

  await db.transaction("rw", db.business_profile, db.sync_queue, async () => {
    await db.business_profile.put(row);
    await enqueue("business_profile", row.id, existing ? QUEUE_OP.UPDATE : QUEUE_OP.CREATE, row);
  });

  return row;
}

// ─── deleteCustomer ───────────────────────────────────────────────────────────

export async function deleteCustomer(customerId) {
  const db = getDb();
  const ts = now();

  const customerBills = await db.bills
    .where("customer_id")
    .equals(customerId)
    .filter((b) => !b.is_deleted)
    .toArray();

  await db.transaction(
    "rw", db.customers, db.vehicles, db.bills, db.bill_items, db.sync_queue,
    async () => {
      for (const bill of customerBills) {
        await db.bill_items
          .where("bill_id").equals(bill.id)
          .modify({ is_deleted: 1, sync_status: SYNC_STATUS.PENDING });
        await db.bills.put({ ...bill, is_deleted: 1, sync_status: SYNC_STATUS.PENDING, updated_at: ts });
        await enqueue("bills", bill.id, QUEUE_OP.DELETE, null);
      }

      const customerVehicles = await db.vehicles.where("customer_id").equals(customerId).toArray();
      for (const v of customerVehicles) {
        await db.vehicles.put({ ...v, is_deleted: 1, sync_status: SYNC_STATUS.PENDING, updated_at: ts });
        await enqueue("vehicles", v.id, QUEUE_OP.DELETE, null);
      }

      const c = await db.customers.get(customerId);
      if (c) {
        await db.customers.put({ ...c, is_deleted: 1, sync_status: SYNC_STATUS.PENDING, updated_at: ts });
        await enqueue("customers", customerId, QUEUE_OP.DELETE, null);
      }
    }
  );
}

// ─── deleteVehicle ────────────────────────────────────────────────────────────

export async function deleteVehicle(vehicleId) {
  const db = getDb();
  const ts = now();

  const vehicleBills = await db.bills
    .where("vehicle_id").equals(vehicleId)
    .filter((b) => !b.is_deleted)
    .toArray();

  await db.transaction(
    "rw", db.vehicles, db.bills, db.bill_items, db.sync_queue,
    async () => {
      for (const bill of vehicleBills) {
        await db.bill_items
          .where("bill_id").equals(bill.id)
          .modify({ is_deleted: 1, sync_status: SYNC_STATUS.PENDING });
        await db.bills.put({ ...bill, is_deleted: 1, sync_status: SYNC_STATUS.PENDING, updated_at: ts });
        await enqueue("bills", bill.id, QUEUE_OP.DELETE, null);
      }
      const v = await db.vehicles.get(vehicleId);
      if (v) {
        await db.vehicles.put({ ...v, is_deleted: 1, sync_status: SYNC_STATUS.PENDING, updated_at: ts });
        await enqueue("vehicles", vehicleId, QUEUE_OP.DELETE, null);
      }
    }
  );
}

// ─── deleteBill ───────────────────────────────────────────────────────────────

export async function deleteBill(billId) {
  const db   = getDb();
  const ts   = now();
  const bill = await db.bills.get(billId);
  if (!bill) throw new Error("Bill not found.");

  await db.transaction("rw", db.bills, db.bill_items, db.sync_queue, async () => {
    await db.bill_items
      .where("bill_id").equals(billId)
      .modify({ is_deleted: 1, sync_status: SYNC_STATUS.PENDING });

    await db.bills.put({ ...bill, is_deleted: 1, sync_status: SYNC_STATUS.PENDING, updated_at: ts });
    await enqueue("bills", billId, QUEUE_OP.DELETE, null);
  });
}

// ─── Sync queue helpers (used by sync engine) ─────────────────────────────────

export async function getPendingQueueOps() {
  const db = getDb();
  return await db.sync_queue
    .where("status")
    .equals(QUEUE_STATUS.PENDING)
    .sortBy("_seq");
}

export async function getPendingCount() {
  const db = getDb();
  const pending = await db.sync_queue.where("status").equals(QUEUE_STATUS.PENDING).count();
  const processing = await db.sync_queue.where("status").equals(QUEUE_STATUS.PROCESSING).count();
  return pending + processing;
}

export async function getFailedCount() {
  const db = getDb();
  return await db.sync_queue.where("status").equals(QUEUE_STATUS.FAILED).count();
}

export async function markQueueOpDone(seq) {
  const db = getDb();
  await db.sync_queue.update(seq, { status: QUEUE_STATUS.DONE });
}

export async function markQueueOpFailed(seq, errorMessage) {
  const db = getDb();
  const op = await db.sync_queue.get(seq);
  if (!op) return;
  await db.sync_queue.update(seq, {
    status:            QUEUE_STATUS.FAILED,
    error_message:     errorMessage,
    retry_count:       (op.retry_count || 0) + 1,
    last_attempted_at: now(),
  });
}

export async function markQueueOpProcessing(seq) {
  const db = getDb();
  await db.sync_queue.update(seq, { status: QUEUE_STATUS.PROCESSING, last_attempted_at: now() });
}

export async function resetFailedOps() {
  const db = getDb();
  await db.sync_queue
    .where("status")
    .equals(QUEUE_STATUS.FAILED)
    .modify({ status: QUEUE_STATUS.PENDING, retry_count: 0, error_message: null });
}

export async function clearFailedOps() {
  const db = getDb();
  await db.sync_queue
    .where("status")
    .equals(QUEUE_STATUS.FAILED)
    .delete();
}

export async function getFailedOps() {
  const db = getDb();
  return db.sync_queue
    .where("status")
    .equals(QUEUE_STATUS.FAILED)
    .toArray();
}

// ─── Duplicate & Orphan Cleanup Migrations ─────────────────────────────────────

export async function cleanupDuplicateBills(db = getDb()) {
  try {
    const allBills = await db.bills.toArray();
    const groups = new Map();
    for (const b of allBills) {
      if (b.is_deleted) continue;
      const num = b.bill_number;
      if (!num || num <= 0) continue;
      if (!groups.has(num)) groups.set(num, []);
      groups.get(num).push(b);
    }

    let cleaned = 0;
    for (const [num, dupGroup] of groups.entries()) {
      if (dupGroup.length <= 1) continue;

      // Duplicate detected!
      // Sort: prefer SYNCED rows, then prefer newest updated_at
      dupGroup.sort((a, b) => {
        if (a.sync_status === SYNC_STATUS.SYNCED && b.sync_status !== SYNC_STATUS.SYNCED) return -1;
        if (b.sync_status === SYNC_STATUS.SYNCED && a.sync_status !== SYNC_STATUS.SYNCED) return 1;
        return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
      });

      const canonical = dupGroup[0];
      const duplicates = dupGroup.slice(1);

      for (const dup of duplicates) {
        // Re-parent items or delete duplicate items
        const canonicalItems = await db.bill_items.where("bill_id").equals(canonical.id).filter((i) => !i.is_deleted).toArray();
        const dupItems = await db.bill_items.where("bill_id").equals(dup.id).filter((i) => !i.is_deleted).toArray();

        if (canonicalItems.length === 0 && dupItems.length > 0) {
          await db.bill_items.where("bill_id").equals(dup.id).modify({ bill_id: canonical.id });
        } else {
          await db.bill_items.where("bill_id").equals(dup.id).delete();
        }

        // Remove queue ops for duplicate
        await db.sync_queue.where("entity_id").equals(dup.id).delete();

        // Delete duplicate bill row
        await db.bills.delete(dup.id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[local-repo] Cleaned up ${cleaned} duplicate bills from IndexedDB.`);
    }
  } catch (err) {
    console.warn("[local-repo] cleanupDuplicateBills error:", err);
  }
}

export async function cleanupOrphanQueueOps(db = getDb()) {
  try {
    const ops = await db.sync_queue.toArray();
    for (const op of ops) {
      if (op.status === QUEUE_STATUS.FAILED) {
        const store = db[op.entity_type];
        if (store) {
          const entity = await store.get(op.entity_id);
          if (!entity || entity.is_deleted) {
            await db.sync_queue.delete(op._seq);
          }
        }
      }
    }
  } catch (err) {
    console.warn("[local-repo] cleanupOrphanQueueOps error:", err);
  }
}

// ─── App settings ─────────────────────────────────────────────────────────────

export async function getAppSetting(key) {
  const db  = getDb();
  const row = await db.app_settings.get(key);
  return row?.value ?? null;
}

export async function setAppSetting(key, value) {
  const db = getDb();
  await db.app_settings.put({ key, value });
}

// ─── Sync checkpoints ─────────────────────────────────────────────────────────

export async function getSyncCheckpoint(tableName) {
  const db  = getDb();
  const row = await db.sync_checkpoint.get(tableName);
  return row?.last_pulled_at ?? null;
}

export async function setSyncCheckpoint(tableName, lastPulledAt) {
  const db = getDb();
  await db.sync_checkpoint.put({ table_name: tableName, last_pulled_at: lastPulledAt });
}

// ─── Wipe user data on logout ─────────────────────────────────────────────────

export async function wipeUserData(userId) {
  const db = getDb();
  await db.transaction(
    "rw",
    db.customers, db.vehicles, db.bills, db.bill_items,
    db.business_profile,
    db.sync_queue, db.sync_checkpoint, db.app_settings,
    async () => {
      if (userId) {
        await Promise.all([
          db.customers.where("user_id").equals(userId).delete(),
          db.vehicles.where("user_id").equals(userId).delete(),
          db.bills.where("user_id").equals(userId).delete(),
          db.bill_items.where("user_id").equals(userId).delete(),
          db.business_profile.where("user_id").equals(userId).delete(),
        ]);
      } else {
        await Promise.all([
          db.customers.clear(),
          db.vehicles.clear(),
          db.bills.clear(),
          db.bill_items.clear(),
          db.business_profile.clear(),
        ]);
      }
      await db.sync_queue.clear();
      await db.sync_checkpoint.clear();
    }
  );
}

// Re-export for convenience
export { QUEUE_STATUS };
