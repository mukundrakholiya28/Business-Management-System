/**
 * exportInvoicePDF
 * ─────────────────────────────────────────────────────────────────────────
 * 1. Fetches the rendered invoice HTML from POST /api/generate-invoice
 * 2. Injects the .sheet element into a hidden <div> in the MAIN document
 *    (html2canvas cannot reach into cross-origin iframes)
 * 3. Screenshots it with html2canvas at 2× scale
 * 4. Places the image into a jsPDF A4 document and saves it
 */

export async function exportInvoicePDF({ bill, items, customer, vehicle }, onToast) {
  let container = null;

  try {
    // ── 1. Fetch rendered HTML from server ────────────────────────────────
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

    // ── 2. Parse the HTML and extract the <style> + .sheet element ────────
    const parser = new DOMParser();
    const doc    = parser.parseFromString(html, "text/html");

    // Grab all <style> tags from the parsed document
    const styles = Array.from(doc.querySelectorAll("style"))
      .map((s) => s.outerHTML)
      .join("\n");

    // The invoice content is inside .sheet
    const sheet = doc.querySelector(".sheet");
    if (!sheet) throw new Error("Invoice template missing .sheet element");

    // ── 3. Mount into the main document (off-screen) ──────────────────────
    container = document.createElement("div");
    container.style.cssText = [
      "position:fixed",
      "top:0",
      "left:-9999px",
      "width:794px",
      "background:#fff",
      "z-index:-1",
    ].join(";");

    // Inject scoped styles + the sheet HTML
    container.innerHTML = styles + sheet.outerHTML;
    document.body.appendChild(container);

    const sheetEl = container.querySelector(".sheet");

    // Wait a tick for styles to apply + fonts to load
    await document.fonts.ready;
    await new Promise((r) => setTimeout(r, 200));

    // ── 4. Screenshot with html2canvas ────────────────────────────────────
    const { default: html2canvas } = await import("html2canvas");

    const canvas = await html2canvas(sheetEl, {
      scale:           2,
      useCORS:         true,
      allowTaint:      false,
      backgroundColor: "#ffffff",
      logging:         false,
      width:           794,
      height:          sheetEl.scrollHeight,
      windowWidth:     794,
      windowHeight:    sheetEl.scrollHeight,
    });

    // ── 5. Build PDF with jsPDF ───────────────────────────────────────────
    const { default: jsPDF } = await import("jspdf");

    const imgData = canvas.toDataURL("image/jpeg", 0.97);

    const A4_W_MM  = 210;
    const A4_H_MM  = 297;

    // px → mm: canvas is at 2× scale, 96dpi → 1px = 0.2646mm at 1×, 0.1323mm at 2×
    const pxToMm   = (px) => (px / 2) * (25.4 / 96);
    const totalHMM = pxToMm(canvas.height);

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

    let yPos      = 0;   // how far down the image we've printed (in mm)
    let pageCount = 0;

    while (yPos < totalHMM) {
      if (pageCount > 0) pdf.addPage();

      // Slice height for this page
      const sliceH = Math.min(A4_H_MM, totalHMM - yPos);

      // addImage(data, format, x, y, width, height, alias, compression, rotation)
      // We shift the image up by yPos to show the next slice
      pdf.addImage(
        imgData,
        "JPEG",
        0,
        -yPos,
        A4_W_MM,
        totalHMM,
        `page${pageCount}`,
        "FAST"
      );

      yPos      += sliceH;
      pageCount += 1;
    }

    pdf.save(`INV-${bill.bill_number}.pdf`);
    onToast?.("PDF downloaded");

  } catch (err) {
    console.error("[exportInvoicePDF]", err);
    onToast?.(`PDF failed: ${err.message}`);
  } finally {
    // ── 6. Cleanup ────────────────────────────────────────────────────────
    if (container && document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}
