import { formatVehicleNumber } from "@/lib/helpers";

/**
 * Send an invoice email via the internal API route.
 * @param {{ bill, items, customer, vehicle }} params
 */
export async function sendInvoiceEmail({ bill, items, customer, vehicle }) {
  if (!customer?.email) {
    throw new Error("Customer has no email address on file.");
  }

  const date = new Date(bill.created_at).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });

  const vehicleLabel = vehicle
    ? `${formatVehicleNumber(vehicle.vehicle_number)}${vehicle.make ? ` — ${vehicle.make} ${vehicle.model || ""}`.trim() : ""}`
    : "—";

  const res = await fetch("/api/send-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
      status:        bill.status,
      paymentMethod: bill.payment_method,
      notes:         bill.notes,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Failed to send email");
  return data;
}
