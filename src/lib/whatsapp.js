/**
 * Send a WhatsApp template message via the internal API route.
 * Uses template: jaspers_market_order_confirmation_v1
 * Parameters: customerName, invoiceNumber, date
 *
 * @param {string} to            - Recipient phone (any format, digits extracted server-side)
 * @param {string} customerName  - e.g. "Rajesh Patel"
 * @param {string} invoiceNumber - e.g. "INV-1005"
 * @param {string} [date]        - e.g. "Jun 20, 2026" — defaults to today if omitted
 * @returns {{ success: boolean, messageId?: string }}
 */
export async function sendWhatsApp(to, customerName, invoiceNumber, date) {
  const res = await fetch("/api/send-whatsapp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, customerName, invoiceNumber, date }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error || "Failed to send WhatsApp message");
  }

  return data;
}

/**
 * Format a date for the WhatsApp template parameter.
 */
export function formatWhatsAppDate(isoDate) {
  return new Date(isoDate || Date.now()).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
