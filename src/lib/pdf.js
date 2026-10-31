import { supabase } from "@/lib/supabase";
import { storePdfLocally } from "@/lib/local-repo";

/**
 * generateInvoicePDF
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates a jsPDF instance for the given invoice.
 *
 * Offline-first strategy:
 *   1. Try the server API (/api/generate-invoice) which renders the full EJS
 *      template with real fonts, logo, and company profile.
 *   2. If the server is unreachable (offline), fall back to a clean local
 *      HTML template rendered entirely in the browser.
 *
 * After generating the PDF:
 *   - Saves the blob to IndexedDB (pdf_cache) so it survives page reloads.
 *   - The sync engine uploads the blob to Supabase Storage when online.
 */

export async function generateInvoicePDF({ bill, items, customer, vehicle }) {
  let container = null;

  try {
    let html = null;

    // ── 1. Try server-rendered template ───────────────────────────────────
    try {
      const { data: { session } } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      const token = session?.access_token;

      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), 8000); // 8s timeout

      const res = await fetch("/api/generate-invoice", {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body:   JSON.stringify({ bill, items, customer, vehicle }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        html = await res.text();
      }
    } catch (fetchErr) {
      console.warn("[pdf] Server template unavailable, using local fallback:", fetchErr.message);
    }

    // ── 2. Local fallback template ─────────────────────────────────────────
    if (!html) {
      html = buildLocalTemplate({ bill, items, customer, vehicle });
    }

    // ── 3. Parse HTML — extract styles + .sheet elements ──────────────────
    const parser  = new DOMParser();
    const doc     = parser.parseFromString(html, "text/html");
    const styles  = Array.from(doc.querySelectorAll("style")).map((s) => s.outerHTML).join("\n");
    const sheets  = Array.from(doc.querySelectorAll(".sheet"));

    if (!sheets.length) throw new Error("Invoice template missing .sheet element");

    // ── 4. Mount into the main document (off-screen) ──────────────────────
    container = document.createElement("div");
    container.style.cssText = [
      "position:fixed",
      "top:0",
      "left:-9999px",
      "width:794px",
      "background:#fff",
      "z-index:-1",
    ].join(";");

    container.innerHTML = styles + sheets.map((s) => s.outerHTML).join("\n");
    document.body.appendChild(container);

    // Wait for fonts + layout
    await document.fonts.ready;
    await new Promise((r) => setTimeout(r, 250));

    // ── 5. Screenshot each .sheet with html2canvas ────────────────────────
    const { default: html2canvas } = await import("html2canvas");

    const mountedSheets = Array.from(container.querySelectorAll(".sheet"));
    const canvases = [];

    for (const sheetEl of mountedSheets) {
      const c = await html2canvas(sheetEl, {
        scale:           2,
        useCORS:         true,
        allowTaint:      false,
        backgroundColor: "#ffffff",
        logging:         false,
        width:           794,
        height:          sheetEl.offsetHeight || 1123,
        windowWidth:     794,
        windowHeight:    sheetEl.offsetHeight || 1123,
      });
      canvases.push(c);
    }

    // ── 6. Build A4 PDF — one canvas per page ─────────────────────────────
    const { default: jsPDF } = await import("jspdf");

    const A4_W = 210;
    const A4_H = 297;
    const pdf  = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

    canvases.forEach((canvas, idx) => {
      if (idx > 0) pdf.addPage();
      const imgData     = canvas.toDataURL("image/jpeg", 0.97);
      const aspectRatio = canvas.width / canvas.height;
      let imgW = A4_W;
      let imgH = A4_W / aspectRatio;
      if (imgH > A4_H) { imgH = A4_H; imgW = A4_H * aspectRatio; }
      const xOffset = (A4_W - imgW) / 2;
      pdf.addImage(imgData, "JPEG", xOffset, 0, imgW, imgH, `sheet${idx}`, "FAST");
    });

    // ── 7. Cache the PDF blob locally for offline use ─────────────────────
    try {
      const blob = pdf.output("blob");
      await storePdfLocally(bill, blob);
    } catch (cacheErr) {
      console.warn("[pdf] Could not cache PDF locally:", cacheErr.message);
    }

    return pdf;

  } finally {
    if (container && document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}

export async function exportInvoicePDF({ bill, items, customer, vehicle }, onToast) {
  try {
    const pdf = await generateInvoicePDF({ bill, items, customer, vehicle });
    pdf.save(`INV-${bill.bill_number}.pdf`);
    onToast?.("PDF downloaded");
  } catch (err) {
    console.error("[exportInvoicePDF]", err);
    onToast?.(`PDF failed: ${err.message}`);
  }
}

// ─── Local fallback template ──────────────────────────────────────────────────

function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(n) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR",
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(Number(n) || 0);
}

function fmtDate(d) {
  return new Date(d || Date.now()).toLocaleDateString("en-IN", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

function buildLocalTemplate({ bill, items, customer, vehicle }) {
  const sortedItems = [...(items || [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );

  const invoiceNum = `SRC-${String(bill.bill_number || "?").padStart(4, "0")}`;
  const statusLabel = {
    paid: "Paid", pending: "Due", partially_paid: "Partially Paid",
    draft: "Draft", cancelled: "Void",
  }[bill.status] || bill.status;

  const vehicleStr = vehicle
    ? `${vehicle.make || ""} ${vehicle.model || ""} · ${vehicle.vehicle_number || ""}`.trim()
    : "";

  const itemRows = sortedItems.map((i) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0">${esc(i.description)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:center">${Number(i.quantity)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:right">${fmt(i.unit_price)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:right">${fmt(i.total_price)}</td>
    </tr>`).join("");

  const balanceDue = Math.max(0, Number(bill.total_amount) - Number(bill.paid_amount || 0));

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, Arial, sans-serif; background: #f5f5f5; }
    .sheet {
      width: 794px; min-height: 1123px; background: #fff;
      padding: 40px 48px; display: flex; flex-direction: column;
    }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
    .company-name { font-size: 22px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
    .company-sub  { font-size: 11px; color: #666; margin-top: 2px; }
    .invoice-badge {
      background: #1a1d27; color: #fff; border-radius: 8px;
      padding: 10px 18px; text-align: right;
    }
    .invoice-badge .num { font-size: 18px; font-weight: 700; }
    .invoice-badge .status { font-size: 10px; opacity: 0.7; margin-top: 2px; }
    .divider { border: none; border-top: 1px solid #e5e7eb; margin: 20px 0; }
    .meta { display: flex; gap: 40px; margin-bottom: 24px; }
    .meta-block label { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; display: block; }
    .meta-block span  { font-size: 13px; font-weight: 500; color: #1a1d27; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead tr { background: #f9fafb; }
    thead th { padding: 8px; text-align: left; font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e5e7eb; }
    thead th:last-child, thead th:nth-child(3), thead th:nth-child(2) { text-align: right; }
    thead th:nth-child(2) { text-align: center; }
    .totals { margin-top: 16px; display: flex; justify-content: flex-end; }
    .totals-table { width: 260px; font-size: 13px; }
    .totals-table tr td { padding: 4px 0; }
    .totals-table tr td:last-child { text-align: right; }
    .totals-table .total-row { font-weight: 700; font-size: 15px; border-top: 2px solid #1a1d27; padding-top: 8px; margin-top: 4px; }
    .balance-row { color: #c05a5a; font-weight: 700; }
    .footer { margin-top: auto; padding-top: 24px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
  </style>
  </head><body>
  <div class="sheet">
    <div class="header">
      <div>
        <div class="company-name">Shree Royal Car</div>
        <div class="company-sub">Automotive Repair &amp; Car Wash</div>
        <div class="company-sub" style="margin-top:8px;color:#374151">Ahmedabad, Gujarat</div>
      </div>
      <div class="invoice-badge">
        <div class="num">${esc(invoiceNum)}</div>
        <div class="status">${esc(statusLabel)}</div>
        <div style="font-size:11px;margin-top:4px">${esc(fmtDate(bill.created_at))}</div>
      </div>
    </div>

    <hr class="divider"/>

    <div class="meta">
      <div class="meta-block">
        <label>Bill To</label>
        <span>${esc(customer?.name || "Walk-in Customer")}</span>
        ${customer?.phone_number ? `<div style="font-size:12px;color:#6b7280;margin-top:2px">${esc(customer.phone_number)}</div>` : ""}
      </div>
      ${vehicleStr ? `<div class="meta-block"><label>Vehicle</label><span>${esc(vehicleStr)}</span>${bill.kms_run ? `<div style="font-size:12px;color:#6b7280;margin-top:2px">${Number(bill.kms_run).toLocaleString("en-IN")} km</div>` : ""}</div>` : ""}
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:50%">Description</th>
          <th style="width:10%">Qty</th>
          <th style="width:20%">Rate</th>
          <th style="width:20%">Amount</th>
        </tr>
      </thead>
      <tbody>${itemRows || `<tr><td colspan="4" style="padding:16px;text-align:center;color:#9ca3af">No items</td></tr>`}</tbody>
    </table>

    <div class="totals">
      <table class="totals-table">
        <tr><td>Subtotal</td><td>${fmt(bill.subtotal)}</td></tr>
        ${Number(bill.discount) > 0 ? `<tr><td>Discount</td><td style="color:#4a9e80">-${fmt(bill.discount)}</td></tr>` : ""}
        ${Number(bill.tax_amount) > 0 ? `<tr><td>GST (${bill.gst_rate || 18}%)</td><td>${fmt(bill.tax_amount)}</td></tr>` : ""}
        <tr class="total-row"><td>Total</td><td>${fmt(bill.total_amount)}</td></tr>
        ${Number(bill.paid_amount) > 0 ? `<tr><td>Paid</td><td style="color:#4a9e80">${fmt(bill.paid_amount)}</td></tr>` : ""}
        ${balanceDue > 0 ? `<tr class="balance-row"><td>Balance Due</td><td>${fmt(balanceDue)}</td></tr>` : ""}
      </table>
    </div>

    ${bill.notes ? `<div style="margin-top:24px;padding:12px;background:#f9fafb;border-radius:8px;font-size:12px;color:#6b7280">${esc(bill.notes)}</div>` : ""}

    <div class="footer">
      Thank you for your business. &nbsp;&bull;&nbsp; Shree Royal Car, Ahmedabad
      ${bill.pdf_url ? "" : '<br><span style="font-size:10px;color:#d1d5db">(Generated offline — will be updated when connected)</span>'}
    </div>
  </div>
  </body></html>`;
}
