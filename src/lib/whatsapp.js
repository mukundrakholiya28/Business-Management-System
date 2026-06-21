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
export function sendWhatsApp(phoneNumber, customerName, invoiceNumber, totalAmount, invoicePdfUrl) {
  // Remove all non-digit characters from phone number
  const cleanPhone = phoneNumber.replace(/\D/g, '');
  
  // Construct the message
  let message = `Hello ${customerName},\n\n`;
  message += `Thank you for choosing *Shree Royal Car*! 🚗\n\n`;
  message += `Your invoice *${invoiceNumber}* has been generated.\n`;
  message += `*Total Amount: ${totalAmount}*\n\n`;
  
  if (invoicePdfUrl) {
    message += `📄 Download Invoice: ${invoicePdfUrl}\n\n`;
  }
  
  message += `For any queries, feel free to contact us.\n\n`;
  message += `Best regards,\n`;
  message += `Shree Royal Car Team`;
  
  // Encode message for URL
  const encodedMessage = encodeURIComponent(message);
  
  // Construct WhatsApp URL (wa.me scheme)
  const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
  
  // Open in new tab
  window.open(whatsappUrl, '_blank');
  
  return { success: true };
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
