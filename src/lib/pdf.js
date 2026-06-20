/**
 * exportInvoicePDF
 * ─────────────────────────────────────────────────────────────────────────
 * 1. Fetches the fully-rendered invoice HTML from POST /api/generate-invoice
 * 2. Injects it into a hidden off-screen iframe so the browser lays it out
 *    with all fonts, CSS, and images exactly as in the preview
 * 3. Uses html2canvas to screenshot the rendered invoice at 2× scale
 * 4. Uses jsPDF to place that screenshot into an A4 PDF and save it
 *
 * This gives a pixel-perfect copy of the HTML — every font, border, colour,
 * and the ₹ symbol all render correctly because it's a real browser rendering.
 */

export async function exportInvoicePDF({ bill, items, customer, vehicle }, onToast) {
  try {
    // ── 1. Get the rendered HTML ──────────────────────────────────────────
    const res = await fetch("/api/generate-invoice", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ bill, items, customer, vehicle }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const html = await res.text();

    // ── 2. Render HTML in a hidden iframe ─────────────────────────────────
    const iframe = document.createElement("iframe");
    iframe.style.cssText = [
      "position:fixed",
      "top:0",
      "left:-9999px",
      "width:794px",        // A4 at 96dpi
      "height:1123px",
      "border:none",
      "visibility:hidden",
    ].join(";");
    document.body.appendChild(iframe);

    await new Promise((resolve) => {
      iframe.onload = resolve;
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();
    });

    // Wait for fonts to finish loading inside the iframe
    const iframeWin = iframe.contentWindow;
    if (iframeWin.document.fonts?.ready) {
      await iframeWin.document.fonts.ready;
    } else {
      await new Promise((r) => setTimeout(r, 400));
    }

    // ── 3. Screenshot with html2canvas ────────────────────────────────────
    const { default: html2canvas } = await import("html2canvas");

    const invoiceEl = iframe.contentDocument.querySelector(".sheet") ||
                      iframe.contentDocument.body;

    const canvas = await html2canvas(invoiceEl, {
      scale:          2,           // 2× for crisp text at A4 print resolution
      useCORS:        true,
      allowTaint:     false,
      backgroundColor: "#ffffff",
      logging:        false,
      // Tell html2canvas the element is inside an iframe
      windowWidth:    794,
      windowHeight:   invoiceEl.scrollHeight,
    });

    // ── 4. Place canvas into jsPDF A4 ─────────────────────────────────────
    const { default: jsPDF } = await import("jspdf");

    const imgData = canvas.toDataURL("image/jpeg", 0.97);

    // A4 dimensions in mm
    const A4_W = 210;
    const A4_H = 297;

    // Scale image to fit A4 width, allow multi-page if taller
    const imgW   = A4_W;
    const imgH   = (canvas.height / canvas.width) * A4_W;

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

    let yOffset = 0;
    let remaining = imgH;

    while (remaining > 0) {
      const sliceH = Math.min(remaining, A4_H);

      // For pages after the first, add a new page
      if (yOffset > 0) pdf.addPage();

      // Clip by drawing only the relevant slice of the image
      // html2canvas gives us the full image; we use pdf.addImage with y offset
      pdf.addImage(
        imgData,
        "JPEG",
        0,                          // x
        -(yOffset),                 // y — negative offsets into the tall image
        imgW,
        imgH,
        undefined,
        "FAST"
      );

      yOffset   += A4_H;
      remaining -= A4_H;
    }

    pdf.save(`INV-${bill.bill_number}.pdf`);

    // ── 5. Cleanup ────────────────────────────────────────────────────────
    document.body.removeChild(iframe);
    onToast?.("PDF downloaded");

  } catch (err) {
    console.error("[exportInvoicePDF]", err);
    onToast?.(`PDF failed: ${err.message}`);
  }
}
