/**
 * Opens WhatsApp Web or App with a pre-filled message to send invoice.
 * No business verification required - uses standard WhatsApp URL scheme.
 * 
 * @param {string} phoneNumber   - Customer phone (must include country code, e.g., +919876543210)
 * @param {string} customerName  - e.g. "Rajesh Patel"
 * @param {string} invoiceNumber - e.g. "INV-1005"
 * @param {string} totalAmount   - e.g. "₹5,000"
 * @param {string} [invoicePdfUrl] - Optional: URL to download invoice PDF
 */
export async function sendWhatsApp(phoneNumber, customerName, invoiceNumber, totalAmount, invoicePdfUrl) {
  // Remove all non-digit characters from phone number
  const cleanPhone = phoneNumber.replace(/\D/g, '');
  
  const response = await fetch("/api/send-whatsapp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: cleanPhone,
      customerName,
      invoiceNumber,
    }),
  });
  
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Failed to send WhatsApp message");
  }
  
  return { success: true, messageId: data.messageId };
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
