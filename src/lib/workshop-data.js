import { supabase } from "@/lib/supabase";
import { generateId, normalizePhoneNumber } from "@/lib/helpers";

export function isSupabaseReady() {
  return Boolean(supabase);
}

// ── Auth helper ───────────────────────────────────────────────────────────────

/**
 * Returns the current user's UUID.
 * Throws if not authenticated — all data operations require auth.
 */
async function getUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Not authenticated.");
  return user.id;
}

// ─── Workshop data ────────────────────────────────────────────────────────────

export async function loadWorkshopData() {
  if (!isSupabaseReady()) {
    throw new Error(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your .env file."
    );
  }

  // RLS automatically filters to the current user's rows —
  // no .eq("user_id", ...) needed here.
  const [customersResult, vehiclesResult, billsResult, billItemsResult] = await Promise.all([
    supabase.from("customers").select("*").order("created_at", { ascending: false }),
    supabase.from("vehicles").select("*").order("created_at", { ascending: false }),
    supabase.from("bills").select("*").order("bill_number", { ascending: false }),
    supabase.from("bill_items").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
  ]);

  const firstError = [customersResult, vehiclesResult, billsResult, billItemsResult].find(
    (r) => r.error
  );
  if (firstError) throw new Error(firstError.error.message);

  return {
    source: "supabase",
    customers: customersResult.data || [],
    vehicles:  vehiclesResult.data  || [],
    bills:     billsResult.data     || [],
    billItems: billItemsResult.data || [],
  };
}

// ─── Customers & Vehicles ─────────────────────────────────────────────────────

export async function saveCustomerWithVehicles({ customer, vehicles }) {
  if (!isSupabaseReady()) throw new Error("Supabase is not configured.");

  const userId = await getUserId();

  const customerName = customer?.name?.trim() || "";
  const customerPhone = customer?.phone_number ? normalizePhoneNumber(customer.phone_number) : "";

  // Check for duplicate customer by phone number if provided
  if (customerPhone) {
    const { data: existingCustomers, error: customerLookupError } = await supabase
      .from("customers")
      .select("id, name")
      .eq("phone_number", customerPhone)
      .limit(1);
    if (customerLookupError) throw new Error(customerLookupError.message);
    if (existingCustomers?.length) {
      throw new Error("Customer already exists with this phone number.");
    }
  }

  // Filter out completely empty vehicle inputs (allow saving a customer with no vehicles)
  const validVehicles = (vehicles || []).filter((v) =>
    v.vehicle_number?.trim() || v.make?.trim() || v.model?.trim() || v.year || v.color?.trim()
  );

  // Check for duplicate vehicle numbers within the batch (only for non-empty vehicle numbers)
  const seen = new Set();
  for (const v of validVehicles) {
    const num = v.vehicle_number?.trim().toUpperCase();
    if (num) {
      if (seen.has(num)) throw new Error("Duplicate vehicle number in the list.");
      seen.add(num);
    }
  }

  // Check duplicate vehicle numbers across the database (only for non-empty vehicle numbers)
  const nonTempVehicles = validVehicles.filter((v) => v.vehicle_number?.trim());
  if (nonTempVehicles.length > 0) {
    const { data: existingVehicles, error: lookupError } = await supabase
      .from("vehicles")
      .select("id, vehicle_number")
      .in("vehicle_number", nonTempVehicles.map((v) => v.vehicle_number.trim().toUpperCase()));

    if (lookupError) throw new Error(lookupError.message);
    if (existingVehicles?.length) {
      throw new Error(
        `Vehicle number ${existingVehicles[0].vehicle_number} is already registered.`
      );
    }
  }

  // Insert customer — include user_id
  const { id: _id, ...customerPayload } = customer;
  customerPayload.name = customerName;
  customerPayload.phone_number = customerPhone;

  const { data: createdCustomer, error: customerError } = await supabase
    .from("customers")
    .insert([{ ...customerPayload, user_id: userId }])
    .select("*")
    .single();
  if (customerError) throw new Error(customerError.message);

  // Insert vehicles — include user_id
  let createdVehicles = [];
  if (validVehicles.length > 0) {
    const vehiclePayload = validVehicles.map((v) => ({
      customer_id:    createdCustomer.id,
      user_id:        userId,
      vehicle_number: v.vehicle_number?.trim() ? v.vehicle_number.trim().toUpperCase() : `TEMP-${generateId()}`,
      make:  v.make?.trim()  || null,
      model: v.model?.trim() || null,
      year:  v.year ? Number(v.year) : null,
      color: v.color?.trim() || null,
    }));

    const { data: inserted, error: vehicleError } = await supabase
      .from("vehicles")
      .insert(vehiclePayload)
      .select("*");
    if (vehicleError) throw new Error(vehicleError.message);
    createdVehicles = inserted || [];
  }

  return { customer: createdCustomer, vehicles: createdVehicles };
}

export async function saveVehicle(vehicle, isEditing) {
  if (!isSupabaseReady()) throw new Error("Supabase is not configured.");
  const userId = await getUserId();

  if (!vehicle.customer_id) throw new Error("Customer ID is required.");

  const cleanNumber = vehicle.vehicle_number?.trim() ? vehicle.vehicle_number.trim().toUpperCase() : "";

  // Check duplicate ONLY if a vehicle number is entered and we changed it
  if (cleanNumber && (!isEditing || cleanNumber !== vehicle.original_vehicle_number)) {
    const { data: existingVehicles, error: lookupError } = await supabase
      .from("vehicles")
      .select("id, vehicle_number")
      .eq("vehicle_number", cleanNumber);

    if (lookupError) throw new Error(lookupError.message);
    if (existingVehicles?.length && (!isEditing || existingVehicles[0].id !== vehicle.id)) {
      throw new Error(`Vehicle number ${cleanNumber} is already registered.`);
    }
  }

  const payload = {
    customer_id:    vehicle.customer_id,
    user_id:        userId,
    vehicle_number: cleanNumber || `TEMP-${generateId()}`,
    make:           vehicle.make?.trim()  || null,
    model:          vehicle.model?.trim() || null,
    year:           vehicle.year ? Number(vehicle.year) : null,
    color:          vehicle.color?.trim() || null,
  };

  if (isEditing) {
    const { data: updatedVehicle, error: vehicleError } = await supabase
      .from("vehicles")
      .update(payload)
      .eq("id", vehicle.id)
      .select("*")
      .single();

    if (vehicleError) throw new Error(vehicleError.message);
    return updatedVehicle;
  } else {
    const { data: createdVehicle, error: vehicleError } = await supabase
      .from("vehicles")
      .insert([payload])
      .select("*")
      .single();

    if (vehicleError) throw new Error(vehicleError.message);
    return createdVehicle;
  }
}

// ─── Bills ────────────────────────────────────────────────────────────────────

export async function saveBillWithItems({ bill, items, isEditing }) {
  if (!isSupabaseReady()) throw new Error("Supabase is not configured.");

  const userId = await getUserId();

  // If customer_id or vehicle_id is missing, default to Walk-in Customer / WALK-IN vehicle
  let customerId = bill.customer_id;
  let vehicleId = bill.vehicle_id;

  if (!customerId) {
    const { data: existing, error: findError } = await supabase
      .from("customers")
      .select("id")
      .eq("phone_number", "910000000000")
      .limit(1);
    
    if (existing && existing.length > 0) {
      customerId = existing[0].id;
    } else {
      const { data: created, error: createError } = await supabase
        .from("customers")
        .insert([{
          name: "Walk-in Customer",
          phone_number: "910000000000",
          user_id: userId,
        }])
        .select("id")
        .single();
      if (createError) throw new Error("Could not create default customer: " + createError.message);
      customerId = created.id;
    }
  }

  if (!vehicleId) {
    const { data: existing, error: findError } = await supabase
      .from("vehicles")
      .select("id")
      .eq("customer_id", customerId)
      .eq("vehicle_number", "WALK-IN")
      .limit(1);

    if (existing && existing.length > 0) {
      vehicleId = existing[0].id;
    } else {
      const { data: created, error: createError } = await supabase
        .from("vehicles")
        .insert([{
          customer_id: customerId,
          vehicle_number: "WALK-IN",
          user_id: userId,
          make: "General",
          model: "Vehicle",
        }])
        .select("id")
        .single();
      if (createError) throw new Error("Could not create default vehicle: " + createError.message);
      vehicleId = created.id;
    }
  }

  console.log("--- saveBillWithItems (START) ---");
  console.log("isEditing:", isEditing);
  console.log("Frontend value (bill.created_at):", bill.created_at);

  const itemsProvided = items !== undefined && items !== null;

  // Recalculate totals if items are provided (server-side validation)
  let subtotal = Number(bill.subtotal || 0);
  let discount = Number(bill.discount || 0);
  let tax_amount = Number(bill.tax_amount || 0);
  let total_amount = Number(bill.total_amount || 0);
  let itemPayload = null;

  if (itemsProvided) {
    if (!Array.isArray(items)) throw new Error("Invalid items format.");
    subtotal = 0;
    const cleanItems = [];
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.description?.trim()) continue;
      
      const qty = Math.max(0, Number(item.quantity || 0));
      const price = Math.max(0, Number(item.unit_price || 0));
      const total = Math.round(qty * price * 100) / 100;
      
      subtotal += total;
      
      cleanItems.push({
        description: item.description.trim(),
        quantity: qty,
        unit_price: price,
        total_price: total,
        sort_order: i
      });
    }
    
    subtotal = Math.round(subtotal * 100) / 100;
    discount = Math.max(0, Number(bill.discount || 0));
    if (discount > subtotal) {
      discount = subtotal;
    }
    
    const taxableAmount = Math.max(0, subtotal - discount);
    const gstRate = bill.gst_enabled ? Number(bill.gst_rate ?? 18) : 0;
    tax_amount = Math.round(taxableAmount * (gstRate / 100) * 100) / 100;
    total_amount = Math.round((taxableAmount + tax_amount) * 100) / 100;
    itemPayload = cleanItems;
  }

  // Sanitize and align status and paid_amount
  let status = bill.status;
  let paid_amount = Number(bill.paid_amount || 0);
  if (status === "paid") {
    paid_amount = total_amount;
  } else if (status === "pending" || status === "draft" || status === "cancelled") {
    paid_amount = 0;
  } else if (status === "partially_paid") {
    if (paid_amount <= 0) {
      paid_amount = 0;
      status = "pending";
    } else if (paid_amount >= total_amount) {
      paid_amount = total_amount;
      status = "paid";
    }
  }

  // Get current payment history or init new one
  let updatedHistory = bill.payment_history || [];
  if (!Array.isArray(updatedHistory)) {
    updatedHistory = [];
  }

  if (isEditing) {
    // 1. Fetch current bill data from database to check payment history
    const { data: currentBill, error: fetchError } = await supabase
      .from("bills")
      .select("paid_amount, payment_history")
      .eq("id", bill.id)
      .single();

    if (!itemsProvided && !fetchError && currentBill) {
      const currentPaid = Number(currentBill.paid_amount || 0);
      const nextPaid = Number(paid_amount);
      updatedHistory = currentBill.payment_history || [];
      if (!Array.isArray(updatedHistory)) {
        updatedHistory = [];
      }

      if (nextPaid !== currentPaid) {
        if (nextPaid > currentPaid) {
          // Amount increased - record the difference as a new payment
          updatedHistory.push({
            date: new Date().toISOString(),
            amount: nextPaid - currentPaid,
            method: bill.payment_method || "cash"
          });
        } else {
          // Amount decreased - adjust history by resetting to a single entry
          updatedHistory = nextPaid > 0 ? [{
            date: new Date().toISOString(),
            amount: nextPaid,
            method: bill.payment_method || "cash"
          }] : [];
        }
      }
    }
  } else {
    // New bill payment history initialization
    if (paid_amount > 0 && updatedHistory.length === 0) {
      updatedHistory = [{
        date: new Date().toISOString(),
        amount: paid_amount,
        method: bill.payment_method || "cash"
      }];
    }
  }

  console.log("Saving bill via secure transaction RPC...");

  // Invoke RPC for transaction-safe database write
  const { data: savedBillJson, error: rpcError } = await supabase.rpc(
    "save_bill_with_items",
    {
      p_bill_id:         isEditing ? bill.id : null,
      p_customer_id:     customerId,
      p_vehicle_id:      vehicleId,
      p_kms_run:         bill.kms_run ? Number(bill.kms_run) : null,
      p_subtotal:        subtotal,
      p_tax_amount:      tax_amount,
      p_discount:        discount,
      p_total_amount:    total_amount,
      p_status:          status,
      p_payment_method:  bill.payment_method || null,
      p_paid_amount:     paid_amount,
      p_notes:           bill.notes || null,
      p_pdf_url:         bill.pdf_url || null,
      p_payment_history: updatedHistory,
      p_created_at:      bill.created_at || null,
      p_items:           itemPayload, // JSONB array (or null to bypass update)
      p_user_id:         userId,
    }
  );

  if (rpcError) {
    console.error("RPC Error saving bill:", rpcError);
    throw new Error(rpcError.message);
  }

  console.log("Saved bill result from RPC:", savedBillJson);
  console.log("--- saveBillWithItems (END) ---");

  return {
    bill:  savedBillJson,
    items: itemPayload ? itemPayload.map((i) => ({ ...i, bill_id: savedBillJson.id })) : [],
  };
}

// ─── Business profile ─────────────────────────────────────────────────────────

export async function loadProfile() {
  if (!isSupabaseReady()) throw new Error("Supabase is not configured.");

  // RLS filters to current user automatically
  const { data, error } = await supabase
    .from("business_profile")
    .select("*")
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") throw new Error(error.message);

  return data || {
    name:            "Shree Royal Car",
    tagline:         "Automotive Repair & Car Wash",
    established:     "2004",
    address:         "Ahmedabad, Gujarat",
    phone:           "+91 98765 43210",
    email:           "billing@shreeroyalcar.in",
    gstin:           "",
    payment_methods: "UPI / Bank Transfer / Cash",
    upi_id:          "",
    bank_name:       "",
    account_number:  "",
    ifsc:            "",
    invoice_notes:   "Payment due within 7 days of invoice date.",
  };
}

export async function saveProfile(profile) {
  if (!isSupabaseReady()) throw new Error("Supabase is not configured.");

  const userId = await getUserId();

  const payload = {
    user_id:         userId,
    name:            profile.name,
    tagline:         profile.tagline,
    established:     profile.established,
    address:         profile.address,
    phone:           profile.phone,
    email:           profile.email,
    gstin:           profile.gstin           ?? "",
    payment_methods: profile.payment_methods,
    upi_id:          profile.upi_id          ?? "",
    bank_name:       profile.bank_name        ?? "",
    account_number:  profile.account_number   ?? "",
    ifsc:            profile.ifsc             ?? "",
    invoice_notes:   profile.invoice_notes    ?? "",
  };

  if (profile.id) {
    const { data, error } = await supabase
      .from("business_profile")
      .update(payload)
      .eq("id", profile.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await supabase
    .from("business_profile")
    .insert([payload])
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ─── Customer updates ─────────────────────────────────────────────────────────

export async function updateCustomer(customer) {
  if (!isSupabaseReady()) throw new Error("Supabase is not configured.");
  if (!customer?.id) throw new Error("Customer ID is required.");

  // RLS ensures only the owner can update
  const { error, data } = await supabase
    .from("customers")
    .update({
      name:         customer.name,
      phone_number: normalizePhoneNumber(customer.phone_number),
      email:        customer.email   ?? null,
      address:      customer.address ?? null,
    })
    .eq("id", customer.id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ─── Delete operations ────────────────────────────────────────────────────────

export async function deleteCustomer(customerId) {
  if (!isSupabaseReady()) throw new Error("Supabase is not configured.");

  const { data: customerBills } = await supabase
    .from("bills")
    .select("id")
    .eq("customer_id", customerId);

  if (customerBills?.length) {
    const billIds = customerBills.map((b) => b.id);
    const { error: itemsError } = await supabase
      .from("bill_items").delete().in("bill_id", billIds);
    if (itemsError) throw new Error(itemsError.message);

    const { error: billsError } = await supabase
      .from("bills").delete().in("id", billIds);
    if (billsError) throw new Error(billsError.message);
  }

  const { error: vehiclesError } = await supabase
    .from("vehicles").delete().eq("customer_id", customerId);
  if (vehiclesError) throw new Error(vehiclesError.message);

  const { error } = await supabase
    .from("customers").delete().eq("id", customerId);
  if (error) throw new Error(error.message);
}

export async function deleteVehicle(vehicleId) {
  if (!isSupabaseReady()) throw new Error("Supabase is not configured.");

  const { data: vehicleBills } = await supabase
    .from("bills").select("id").eq("vehicle_id", vehicleId);

  if (vehicleBills?.length) {
    const billIds = vehicleBills.map((b) => b.id);
    const { error: itemsError } = await supabase
      .from("bill_items").delete().in("bill_id", billIds);
    if (itemsError) throw new Error(itemsError.message);

    const { error: billsError } = await supabase
      .from("bills").delete().in("id", billIds);
    if (billsError) throw new Error(billsError.message);
  }

  const { error } = await supabase
    .from("vehicles").delete().eq("id", vehicleId);
  if (error) throw new Error(error.message);
}

export async function deleteBill(billId) {
  if (!isSupabaseReady()) throw new Error("Supabase is not configured.");

  // 1. Fetch the bill to get user_id and bill_number
  const { data: billData, error: fetchError } = await supabase
    .from("bills")
    .select("user_id, bill_number")
    .eq("id", billId)
    .single();
  if (fetchError || !billData) {
    throw new Error(fetchError?.message || "Bill not found.");
  }

  const { user_id, bill_number: deletedNum } = billData;

  // 2. Delete associated bill items
  const { error: itemsError } = await supabase
    .from("bill_items").delete().eq("bill_id", billId);
  if (itemsError) throw new Error(itemsError.message);

  // 3. Delete the bill record
  const { error: deleteError } = await supabase
    .from("bills").delete().eq("id", billId);
  if (deleteError) throw new Error(deleteError.message);

  // 4. Fetch subsequent bills to update
  const { data: billsToUpdate, error: listError } = await supabase
    .from("bills")
    .select("id, bill_number")
    .eq("user_id", user_id)
    .gt("bill_number", deletedNum)
    .order("bill_number", { ascending: true });
  if (listError) throw new Error(listError.message);

  // 5. Update them sequentially to prevent unique constraint conflicts
  if (billsToUpdate && billsToUpdate.length > 0) {
    for (const b of billsToUpdate) {
      const { error: updateError } = await supabase
        .from("bills")
        .update({ bill_number: b.bill_number - 1 })
        .eq("id", b.id);
      if (updateError) throw new Error(updateError.message);
    }
  }
}

// ─── Workers / Salary (legacy) ────────────────────────────────────────────────

export async function loadWorkers() {
  if (!isSupabaseReady()) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("workers").select("*").order("joined_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function saveWorker(worker) {
  if (!isSupabaseReady()) throw new Error("Supabase is not configured.");
  const { id, ...payload } = worker;
  if (id) {
    const { data, error } = await supabase
      .from("workers").update(payload).eq("id", id).select("*").single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from("workers").insert([payload]).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function loadSalaryRecords() {
  if (!isSupabaseReady()) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("salary_records").select("*").order("date_paid", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function saveSalaryRecord(record) {
  if (!isSupabaseReady()) throw new Error("Supabase is not configured.");
  const { id, ...payload } = record;
  const { data, error } = await supabase
    .from("salary_records").insert([payload]).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

// ─── Paginated Loaders for Performance Optimization ───────────────────────────

/**
 * Loads a paginated list of bills including joined customer and vehicle details.
 */
export async function loadBillsPaginated({ page = 1, limit = 20, status = "all" }) {
  if (!isSupabaseReady()) throw new Error("Supabase is not configured.");
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("bills")
    .select("*, customer:customers(name, phone_number), vehicle:vehicles(vehicle_number)", { count: "exact" });

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, count, error } = await query
    .order("bill_number", { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);

  return {
    bills: data || [],
    totalCount: count || 0,
    totalPages: Math.ceil((count || 0) / limit),
    currentPage: page
  };
}

/**
 * Loads a paginated list of customers.
 */
export async function loadCustomersPaginated({ page = 1, limit = 20, searchQuery = "" }) {
  if (!isSupabaseReady()) throw new Error("Supabase is not configured.");
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("customers")
    .select("*, vehicles(*)", { count: "exact" });

  if (searchQuery.trim()) {
    query = query.ilike("name", `%${searchQuery.trim()}%`);
  }

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);

  return {
    customers: data || [],
    totalCount: count || 0,
    totalPages: Math.ceil((count || 0) / limit),
    currentPage: page
  };
}
