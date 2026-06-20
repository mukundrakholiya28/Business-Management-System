import { supabase } from "@/lib/supabase";
import { generateId } from "@/lib/helpers";

export function isSupabaseReady() {
  return Boolean(supabase);
}

// ─── Workshop data ────────────────────────────────────────────────────────────

export async function loadWorkshopData() {
  if (!isSupabaseReady()) {
    throw new Error(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your .env file."
    );
  }

  const [customersResult, vehiclesResult, billsResult, billItemsResult] = await Promise.all([
    supabase.from("customers").select("*").order("created_at", { ascending: false }),
    supabase.from("vehicles").select("*").order("created_at", { ascending: false }),
    supabase.from("bills").select("*").order("created_at", { ascending: false }),
    supabase.from("bill_items").select("*").order("created_at", { ascending: true }),
  ]);

  const firstError = [customersResult, vehiclesResult, billsResult, billItemsResult].find(
    (r) => r.error
  );
  if (firstError) throw new Error(firstError.error.message);

  return {
    source: "supabase",
    customers: customersResult.data || [],
    vehicles: vehiclesResult.data || [],
    bills: billsResult.data || [],
    billItems: billItemsResult.data || [],
  };
}

// ─── Customers & Vehicles ─────────────────────────────────────────────────────

export async function saveCustomerWithVehicles({ customer, vehicles }) {
  if (!isSupabaseReady()) throw new Error("Supabase is not configured.");

  if (!customer?.name || !customer?.phone_number) {
    throw new Error("Customer name and phone number are required.");
  }

  const validVehicles = (vehicles || []).filter((v) => v.vehicle_number?.trim());
  if (!validVehicles.length) throw new Error("Add at least one vehicle.");

  // Check for duplicate vehicle numbers within the batch
  const seen = new Set();
  for (const v of validVehicles) {
    const num = v.vehicle_number.trim().toUpperCase();
    if (seen.has(num)) throw new Error("Duplicate vehicle number in the list.");
    seen.add(num);
  }

  // Check for duplicate vehicle numbers already in DB
  const { data: existingVehicles, error: lookupError } = await supabase
    .from("vehicles")
    .select("id, vehicle_number")
    .in("vehicle_number", validVehicles.map((v) => v.vehicle_number.trim()));

  if (lookupError) throw new Error(lookupError.message);
  if (existingVehicles?.length) {
    throw new Error(
      `Vehicle number ${existingVehicles[0].vehicle_number} is already registered.`
    );
  }

  // Insert customer
  const { id: _id, ...customerPayload } = customer;
  const { data: createdCustomer, error: customerError } = await supabase
    .from("customers")
    .insert([customerPayload])
    .select("*")
    .single();
  if (customerError) throw new Error(customerError.message);

  // Insert vehicles
  const vehiclePayload = validVehicles.map((v) => ({
    customer_id: createdCustomer.id,
    vehicle_number: v.vehicle_number.trim().toUpperCase(),
    make: v.make?.trim() || null,
    model: v.model?.trim() || null,
    year: v.year ? Number(v.year) : null,
    color: v.color?.trim() || null,
  }));

  const { data: createdVehicles, error: vehicleError } = await supabase
    .from("vehicles")
    .insert(vehiclePayload)
    .select("*");
  if (vehicleError) throw new Error(vehicleError.message);

  return { customer: createdCustomer, vehicles: createdVehicles || [] };
}

// ─── Bills ────────────────────────────────────────────────────────────────────

export async function saveBillWithItems({ bill, items, isEditing }) {
  if (!isSupabaseReady()) throw new Error("Supabase is not configured.");

  // items === undefined means "don't touch line items" (e.g. status-only update)
  // items === [] or items === [...] means "replace line items with this set"
  const itemsProvided = items !== undefined && items !== null;

  const itemPayload = itemsProvided
    ? (items || [])
        .filter((i) => i.description?.trim())
        .map((i) => ({
          description: i.description,
          quantity: i.quantity,
          unit_price: i.unit_price,
          total_price: i.quantity * i.unit_price,
        }))
    : null;

  if (isEditing) {
    const { data: updatedBills, error: updateError } = await supabase
      .from("bills")
      .update({
        customer_id: bill.customer_id,
        vehicle_id: bill.vehicle_id,
        subtotal: bill.subtotal,
        tax_amount: bill.tax_amount,
        discount: bill.discount,
        total_amount: bill.total_amount,
        status: bill.status,
        payment_method: bill.payment_method || null,
        notes: bill.notes,
      })
      .eq("id", bill.id)
      .select("*");

    if (updateError) throw new Error(updateError.message);

    // Only replace line items if they were explicitly passed in
    if (itemPayload !== null) {
      const { error: deleteError } = await supabase
        .from("bill_items")
        .delete()
        .eq("bill_id", bill.id);
      if (deleteError) throw new Error(deleteError.message);

      if (itemPayload.length) {
        const { error: insertItemsError } = await supabase
          .from("bill_items")
          .insert(itemPayload.map((i) => ({ ...i, bill_id: bill.id })));
        if (insertItemsError) throw new Error(insertItemsError.message);
      }
    }

    return {
      bill: updatedBills?.[0] || bill,
      items: itemPayload ? itemPayload.map((i) => ({ ...i, bill_id: bill.id })) : [],
    };
  }

  // Create new bill
  const { id: _id, bill_number: _bn, gst_enabled: _ge, gst_rate: _gr, ...billPayload } = bill;
  const { data: createdBill, error: createError } = await supabase
    .from("bills")
    .insert([{ ...billPayload, payment_method: bill.payment_method || null }])
    .select("*")
    .single();
  if (createError) throw new Error(createError.message);

  // itemPayload is always defined for new bills (items is always passed on create)
  const newItemPayload = itemPayload ?? [];
  if (newItemPayload.length) {
    const { error: insertItemsError } = await supabase
      .from("bill_items")
      .insert(newItemPayload.map((i) => ({ ...i, bill_id: createdBill.id })));
    if (insertItemsError) throw new Error(insertItemsError.message);
  }

  return {
    bill: createdBill,
    items: newItemPayload.map((i) => ({ ...i, bill_id: createdBill.id })),
  };
}

/**
 * Update customer profile fields (name, phone_number, email, address).
 * Does NOT touch vehicles.
 */
export async function updateCustomer(customer) {
  if (!isSupabaseReady()) throw new Error("Supabase is not configured.");
  if (!customer?.id) throw new Error("Customer ID is required.");

  const { error, data } = await supabase
    .from("customers")
    .update({
      name: customer.name,
      phone_number: customer.phone_number,
      email: customer.email ?? null,
      address: customer.address ?? null,
    })
    .eq("id", customer.id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ─── Delete operations ────────────────────────────────────────────────────────

/**
 * Delete a customer and all related vehicles, bills, and bill_items.
 * Supabase schema uses ON DELETE CASCADE on vehicles→customer and
 * bill_items→bill, so deleting the customer cascades to vehicles.
 * Bills have ON DELETE RESTRICT on customer_id, so we delete bills first.
 */
export async function deleteCustomer(customerId) {
  if (!isSupabaseReady()) throw new Error("Supabase is not configured.");

  // Delete bill_items for all bills of this customer
  const { data: customerBills } = await supabase
    .from("bills")
    .select("id")
    .eq("customer_id", customerId);

  if (customerBills?.length) {
    const billIds = customerBills.map((b) => b.id);
    const { error: itemsError } = await supabase
      .from("bill_items")
      .delete()
      .in("bill_id", billIds);
    if (itemsError) throw new Error(itemsError.message);

    const { error: billsError } = await supabase
      .from("bills")
      .delete()
      .in("id", billIds);
    if (billsError) throw new Error(billsError.message);
  }

  // Delete vehicles (cascades from customer, but explicit for safety)
  const { error: vehiclesError } = await supabase
    .from("vehicles")
    .delete()
    .eq("customer_id", customerId);
  if (vehiclesError) throw new Error(vehiclesError.message);

  // Delete customer
  const { error } = await supabase
    .from("customers")
    .delete()
    .eq("id", customerId);
  if (error) throw new Error(error.message);
}

/**
 * Delete a single vehicle and all its associated bills and bill_items.
 */
export async function deleteVehicle(vehicleId) {
  if (!isSupabaseReady()) throw new Error("Supabase is not configured.");

  const { data: vehicleBills } = await supabase
    .from("bills")
    .select("id")
    .eq("vehicle_id", vehicleId);

  if (vehicleBills?.length) {
    const billIds = vehicleBills.map((b) => b.id);
    const { error: itemsError } = await supabase
      .from("bill_items")
      .delete()
      .in("bill_id", billIds);
    if (itemsError) throw new Error(itemsError.message);

    const { error: billsError } = await supabase
      .from("bills")
      .delete()
      .in("id", billIds);
    if (billsError) throw new Error(billsError.message);
  }

  const { error } = await supabase
    .from("vehicles")
    .delete()
    .eq("id", vehicleId);
  if (error) throw new Error(error.message);
}

/**
 * Delete a single bill and its line items.
 */
export async function deleteBill(billId) {
  if (!isSupabaseReady()) throw new Error("Supabase is not configured.");

  const { error: itemsError } = await supabase
    .from("bill_items")
    .delete()
    .eq("bill_id", billId);
  if (itemsError) throw new Error(itemsError.message);

  const { error } = await supabase
    .from("bills")
    .delete()
    .eq("id", billId);
  if (error) throw new Error(error.message);
}


export async function loadWorkers() {
  if (!isSupabaseReady()) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase
    .from("workers")
    .select("*")
    .order("joined_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function saveWorker(worker) {
  if (!isSupabaseReady()) throw new Error("Supabase is not configured.");

  const { id, ...payload } = worker;
  if (id) {
    const { data, error } = await supabase
      .from("workers")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from("workers")
    .insert([payload])
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ─── Salary Records ───────────────────────────────────────────────────────────

export async function loadSalaryRecords() {
  if (!isSupabaseReady()) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase
    .from("salary_records")
    .select("*")
    .order("date_paid", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function saveSalaryRecord(record) {
  if (!isSupabaseReady()) throw new Error("Supabase is not configured.");

  const { id, ...payload } = record;
  const { data, error } = await supabase
    .from("salary_records")
    .insert([payload])
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}
