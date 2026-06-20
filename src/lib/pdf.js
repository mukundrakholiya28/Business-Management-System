/**
 * exportInvoicePDF
 * ──────────────────────────────────────────────────────────────────────────
 * Calls /api/generate-invoice, receives a PDF blob and triggers a download.
 * Falls back to the legacy jsPDF path if the server returns an error.
 *
 * @param {{ bill, items, customer, vehicle }} data
 * @param {function} [onToast] - optional toast callback for feedback
 */
export async function exportInvoicePDF({ bill, items, customer, vehicle }, onToast) {
  try {
    const res = await fetch("/api/generate-invoice", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ bill, items, customer, vehicle }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `INV-${bill.bill_number}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    onToast?.("PDF downloaded");
  } catch (err) {
    console.error("[exportInvoicePDF]", err.message);
    // Fallback to legacy jsPDF so the user always gets something
    await exportInvoicePDFFallback({ bill, items, customer, vehicle });
    onToast?.("PDF downloaded (fallback)");
  }
}

// ── Legacy jsPDF fallback (plain table, no branding) ──────────────────────────
async function exportInvoicePDFFallback({ bill, items, customer, vehicle }) {
  const { default: jsPDF }    = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const { formatCurrency, formatDate } = await import("@/lib/helpers");

  const doc = new jsPDF();
  doc.setFontSize(20); doc.setFont("helvetica", "bold");
  doc.text("SHREE ROYAL CAR", 105, 25, { align: "center" });
  doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(120);
  doc.text("Automotive Repair & Car Wash", 105, 31, { align: "center" });
  doc.setDrawColor(79, 110, 247); doc.setLineWidth(0.5); doc.line(20, 36, 190, 36);
  doc.setTextColor(0); doc.setFontSize(13); doc.setFont("helvetica", "bold");
  doc.text(`INVOICE #INV-${bill.bill_number}`, 20, 47);
  doc.setFontSize(9); doc.setFont("helvetica", "normal");
  doc.text(`Date: ${formatDate(bill.created_at)}`, 20, 54);
  doc.text(`Status: ${bill.status.toUpperCase()}`, 20, 60);
  doc.setFont("helvetica", "bold"); doc.text("Bill To:", 130, 47);
  doc.setFont("helvetica", "normal");
  doc.text(customer?.name || "—", 130, 54);
  doc.text(customer?.phone_number || "—", 130, 60);
  doc.text(`Vehicle: ${vehicle?.vehicle_number || "—"}`, 130, 66);
  doc.text(`${vehicle?.make || ""} ${vehicle?.model || ""}`, 130, 72);

  autoTable(doc, {
    startY: 82,
    head: [["#", "Description", "Qty", "Unit Price", "Total"]],
    body: items.map((item, i) => [
      i + 1, item.description, item.quantity,
      formatCurrency(item.unit_price), formatCurrency(item.total_price),
    ]),
    theme: "plain",
    headStyles: { fillColor: [79, 110, 247], textColor: 255, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 4 },
    alternateRowStyles: { fillColor: [249, 250, 251] },
  });

  const y = doc.lastAutoTable.finalY + 10;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text("Subtotal:", 140, y);
  doc.text(formatCurrency(bill.subtotal), 185, y, { align: "right" });
  if (bill.tax_amount > 0) {
    doc.text(`GST (${bill.gst_rate ?? 18}%):`, 140, y + 6);
    doc.text(formatCurrency(bill.tax_amount), 185, y + 6, { align: "right" });
    doc.text("Discount:", 140, y + 12);
    doc.text(`-${formatCurrency(bill.discount)}`, 185, y + 12, { align: "right" });
    doc.setDrawColor(230); doc.line(140, y + 16, 185, y + 16);
    doc.setFontSize(12); doc.setFont("helvetica", "bold");
    doc.text("Total:", 140, y + 23);
    doc.text(formatCurrency(bill.total_amount), 185, y + 23, { align: "right" });
  } else {
    doc.text("Discount:", 140, y + 6);
    doc.text(`-${formatCurrency(bill.discount)}`, 185, y + 6, { align: "right" });
    doc.setDrawColor(230); doc.line(140, y + 10, 185, y + 10);
    doc.setFontSize(12); doc.setFont("helvetica", "bold");
    doc.text("Total:", 140, y + 17);
    doc.text(formatCurrency(bill.total_amount), 185, y + 17, { align: "right" });
  }
  doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(160);
  doc.text("Thank you for choosing Shree Royal Car!", 105, 280, { align: "center" });
  doc.save(`INV-${bill.bill_number}.pdf`);
}
