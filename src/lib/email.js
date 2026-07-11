import { formatVehicleNumber } from "@/lib/helpers";
import { supabase } from "@/lib/supabase";

/**
 * Send an invoice email via the internal API route.
 * @param {{ bill, items, customer, vehicle, pdfBase64, pdfUrl }} params
 */
export async function sendInvoiceEmail({ bill, items, customer, vehicle, pdfBase64, pdfUrl }) {
  if (!customer?.email) {
    throw new Error("Customer has no email address on file.");
  }

  const date = new Date(bill.created_at).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });

  const vehicleLabel = vehicle
    ? `${formatVehicleNumber(vehicle.vehicle_number)}${vehicle.make ? ` — ${vehicle.make} ${vehicle.model || ""}`.trim() : ""}`
    : "—";

  // Get current session token for API authorization
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch("/api/send-email", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      to:            customer.email,
      customerName:  customer.name,
      invoiceNumber: `INV-${bill.bill_number}`,
      date,
      vehicle:       vehicleLabel,
      items:         items || [],
      subtotal:      bill.subtotal,
      taxAmount:     bill.tax_amount,
      discount:      bill.discount,
      totalAmount:   bill.total_amount,
      paidAmount:    bill.paid_amount || 0,
      status:        bill.status,
      paymentMethod: bill.payment_method,
      notes:         bill.notes,
      pdfBase64,
      pdfUrl,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Failed to send email");
  return data;
}
