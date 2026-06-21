/**
 * exportInvoicePDF
 * ─────────────────────────────────────────────────────────────────────────
 * 1. Fetches rendered invoice HTML (one .sheet per A4 page) from the server
 * 2. Mounts all .sheet elements into a hidden off-screen div in the main doc
 * 3. Screenshots each .sheet individually with html2canvas at 2× scale
 * 4. Places each screenshot on its own A4 page in jsPDF and saves
 */

export async function generateInvoicePDF({ bill, items, customer, vehicle }) {
  let container = null;

  try {
    // Fetch profile details client-side (authenticated session)
    let profile = null;
    try {
      const { loadProfile } = await import("@/lib/workshop-data");
      profile = await loadProfile();
    } catch (e) {
      console.warn("Could not load business profile client-side:", e);
    }

    // ── 1. Fetch rendered HTML ────────────────────────────────────────────
    const res = await fetch("/api/generate-invoice", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ bill, items, customer, vehicle, profile }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const html = await res.text();

    // ── 2. Parse HTML — extract styles + all .sheet elements ─────────────
    const parser  = new DOMParser();
    const doc     = parser.parseFromString(html, "text/html");
    const styles  = Array.from(doc.querySelectorAll("style")).map((s) => s.outerHTML).join("\n");
    const sheets  = Array.from(doc.querySelectorAll(".sheet"));

    if (!sheets.length) throw new Error("Invoice template missing .sheet element");

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

    container.innerHTML = styles + sheets.map((s) => s.outerHTML).join("\n");
    document.body.appendChild(container);

    // Wait for fonts + layout
    await document.fonts.ready;
    await new Promise((r) => setTimeout(r, 250));

    // ── 4. Screenshot each .sheet with html2canvas ────────────────────────
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

    // ── 5. Build A4 PDF — one canvas per page ─────────────────────────────
    const { default: jsPDF } = await import("jspdf");

    const A4_W = 210;  // mm
    const A4_H = 297;  // mm

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

    canvases.forEach((canvas, idx) => {
      if (idx > 0) pdf.addPage();

      const imgData = canvas.toDataURL("image/jpeg", 0.97);

      // Scale image to fit A4 width; if taller than A4, fit to height instead
      const aspectRatio = canvas.width / canvas.height;
      let imgW = A4_W;
      let imgH = A4_W / aspectRatio;

      // If still taller than A4 (very long page), scale down to fit height
      if (imgH > A4_H) {
        imgH = A4_H;
        imgW = A4_H * aspectRatio;
      }

      // Centre horizontally if narrower than A4
      const xOffset = (A4_W - imgW) / 2;

      pdf.addImage(imgData, "JPEG", xOffset, 0, imgW, imgH, `sheet${idx}`, "FAST");
    });

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
