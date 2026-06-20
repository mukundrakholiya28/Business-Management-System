/**
 * exportInvoicePDF
 * ─────────────────────────────────────────────────────────────────────────
 * 1. Fetches the fully-rendered invoice HTML from GET /api/generate-invoice
 * 2. Injects it into a hidden <iframe>
 * 3. Calls iframe.contentWindow.print() — the browser's native print dialog
 *    opens pre-set to "Save as PDF"
 *
 * This means the PDF looks exactly like the browser preview:
 * - All fonts render correctly (including ₹)
 * - All CSS borders, colours, and layout are pixel-perfect
 * - No Puppeteer / server-side Chrome needed at runtime
 *
 * @param {{ bill, items, customer, vehicle }} data
 * @param {function} [onToast]
 */
export async function exportInvoicePDF({ bill, items, customer, vehicle }, onToast) {
  try {
    // ── 1. Get the rendered HTML from the server ──────────────────────────
    const res = await fetch("/api/generate-invoice", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ bill, items, customer, vehicle }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    // Server now returns HTML (text/html) instead of a PDF blob
    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("text/html")) {
      // ── 2. Print the HTML via a hidden iframe ───────────────────────────
      const html = await res.text();
      printHtmlAsPdf(html, `INV-${bill.bill_number}`);
      onToast?.("Print dialog opened — choose 'Save as PDF'");
    } else {
      // Legacy: server returned a PDF blob (old Puppeteer path)
      const blob = await res.blob();
      triggerDownload(blob, `INV-${bill.bill_number}.pdf`);
      onToast?.("PDF downloaded");
    }
  } catch (err) {
    console.error("[exportInvoicePDF]", err.message);
    onToast?.(`PDF failed: ${err.message}`);
  }
}

// ── Print helper ──────────────────────────────────────────────────────────────

function printHtmlAsPdf(html, filename) {
  // Create a hidden iframe
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  // Wait for fonts + images to load, then print
  iframe.onload = () => {
    // Give fonts a moment to render (document.fonts.ready in the iframe)
    const win = iframe.contentWindow;
    const tryPrint = () => {
      win.focus();
      win.print();
      // Remove iframe after print dialog closes
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    };

    if (win.document.fonts?.ready) {
      win.document.fonts.ready.then(tryPrint);
    } else {
      setTimeout(tryPrint, 300);
    }
  };
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
