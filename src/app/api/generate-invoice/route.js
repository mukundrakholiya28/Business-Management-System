/**
 * /api/generate-invoice
 *
 * GET  — returns the invoice HTML rendered with sample data (browser preview)
 * POST — returns the invoice HTML rendered with real bill data
 *
 * The client (src/lib/pdf.js) receives the HTML, injects it into a hidden
 * iframe, and calls window.print() — the browser's own print engine renders
 * the PDF. No Puppeteer required at runtime.
 */

import { NextResponse } from "next/server";
import ejs from "ejs";
import path from "path";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// ── Paths ─────────────────────────────────────────────────────────────────────

const FONTS_DIR    = path.join(process.cwd(), "public", "fonts");
const TEMPLATE_PATH = path.join(process.cwd(), "shree-royal-invoice", "views", "invoice.ejs");
const LOGO_PATH    = path.join(process.cwd(), "public", "logo.png");
const SRC_CSS_PATH = path.join(process.cwd(), "shree-royal-invoice", "public", "css", "invoice.css");

// ── Helpers ───────────────────────────────────────────────────────────────────

function fontBase64(relativePath) {
  return fs.readFileSync(path.join(FONTS_DIR, relativePath)).toString("base64");
}

function logoAsDataUrl() {
  return `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString("base64")}`;
}

function buildFontFaces() {
  return `
@font-face {
  font-family: 'NotoSans'; font-weight: 100 900; font-style: normal;
  src: url('data:font/truetype;base64,${fontBase64("Noto_Sans/NotoSans-VariableFont_wdth,wght.ttf")}') format('truetype');
}
@font-face {
  font-family: 'Poppins'; font-weight: 400; font-style: normal;
  src: url('data:font/truetype;base64,${fontBase64("Poppins/Poppins-Regular.ttf")}') format('truetype');
}
@font-face {
  font-family: 'Poppins'; font-weight: 500; font-style: normal;
  src: url('data:font/truetype;base64,${fontBase64("Poppins/Poppins-Medium.ttf")}') format('truetype');
}
@font-face {
  font-family: 'Poppins'; font-weight: 600; font-style: normal;
  src: url('data:font/truetype;base64,${fontBase64("Poppins/Poppins-SemiBold.ttf")}') format('truetype');
}
@font-face {
  font-family: 'Poppins'; font-weight: 700; font-style: normal;
  src: url('data:font/truetype;base64,${fontBase64("Poppins/Poppins-Bold.ttf")}') format('truetype');
}
@font-face {
  font-family: 'Oswald'; font-weight: 100 900; font-style: normal;
  src: url('data:font/truetype;base64,${fontBase64("Oswald/Oswald-VariableFont_wght.ttf")}') format('truetype');
}`;
}

function cssAsInlineTag() {
  let css = fs.readFileSync(SRC_CSS_PATH, "utf-8");

  // 1. Thin borders
  css = css
    .replace(/border:\s*2px solid var\(--navy\)/g,        "border: 1px solid var(--navy)")
    .replace(/border-bottom:\s*2px solid var\(--navy\)/g, "border-bottom: 1px solid var(--navy)")
    .replace(/border-top:\s*2px solid var\(--navy\)/g,    "border-top: 1px solid var(--navy)")
    .replace(/border:\s*1\.5px solid var\(--navy\)/g,     "border: 1px solid var(--navy)");

  // 2. NotoSans fallback in font stacks
  css = css
    .replace(
      "--font-body:  'Poppins', 'Helvetica Neue', Arial, sans-serif;",
      "--font-body:  'Poppins', 'NotoSans', 'Helvetica Neue', Arial, sans-serif;"
    )
    .replace(
      "--font-brand: 'Vortice', 'Oswald', 'Archivo Black', sans-serif;",
      "--font-brand: 'Vortice', 'Oswald', 'NotoSans', 'Archivo Black', sans-serif;"
    );

  // 3. Full A4 layout — flex column, footer always at bottom
  css += `
/* ── A4 full-page layout ── */
html, body { margin:0; padding:0; background:var(--paper); }

.sheet {
  width: 794px;
  min-height: 1123px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  margin: 0 auto;
  page-break-after: always;
}
.sheet:last-child { page-break-after: avoid; }

.body-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.items {
  flex: 1;
  padding: 32px 40px 8px;
  box-sizing: border-box;
  overflow: hidden;
}
.bottom-section { margin-top: auto; }

table.items-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  box-sizing: border-box;
}
table.items-table th,
table.items-table td {
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-word;
}

/* Continuation page compact header */
.cont-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 40px;
  background: var(--navy);
  border-bottom: 1px solid var(--navy);
}
.cont-invoice-num {
  font-family: var(--font-brand);
  font-size: 15px;
  color: var(--yellow-soft);
  font-weight: 700;
  letter-spacing: 0.5px;
}
.cont-label {
  font-size: 11px;
  color: var(--yellow-soft);
  opacity: 0.7;
  letter-spacing: 1px;
  text-transform: uppercase;
}

@media print {
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; background: white; }
  .sheet { margin: 0; border: none; width: 100%; min-height: 100vh; }
}`;

  return `<style>${buildFontFaces()}\n${css}</style>`;
}

function applyRupeeSpan(html) {
  // Force NotoSans for the ₹ glyph — Chromium/WebKit don't reliably fall through
  // font families for missing glyphs in embedded fonts.
  const span = `<span style="font-family:'NotoSans',sans-serif">₹</span>`;
  return html
    .replace(/&#x20B9;/g, span)
    .replace(/&#8377;/g,  span)
    .replace(/₹/g,        span);
}

function buildTemplateData({ bill, items, customer, vehicle, profile = null }) {
  const invoiceDate = new Date(bill.created_at).toLocaleDateString("en-IN", {
    day: "2-digit", month: "long", year: "numeric",
  });
  const dueDate = new Date(new Date(bill.created_at).getTime() + 7 * 86400000)
    .toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  return {
    company: {
      name:        profile?.name        || "Shree Royal Car",
      tagline:     profile?.tagline     || "Automotive Repair & Car Wash",
      established: profile?.established || "2004",
      address:     profile?.address     || "Ahmedabad, Gujarat",
      phone:       profile?.phone       || process.env.NEXT_PUBLIC_COMPANY_PHONE   || "+91 98765 43210",
      email:       profile?.email       || process.env.NEXT_PUBLIC_COMPANY_EMAIL   || "billing@shreeroyalcar.in",
      gstin:       profile?.gstin       || process.env.NEXT_PUBLIC_COMPANY_GSTIN   || "",
      logo:        logoAsDataUrl(),
    },
    invoice: {
      number: `SRC-${String(bill.bill_number).padStart(4, "0")}`,
      date:   invoiceDate,
      dueDate,
      status:
        bill.status === "paid"      ? "Paid"  :
        bill.status === "pending"   ? "Due"   :
        bill.status === "partially_paid" ? "Partially Paid" :
        bill.status === "draft"     ? "Draft" :
        bill.status === "cancelled" ? "Void"  : bill.status,
    },
    billTo: {
      name:    customer.name,
      address: customer.address || "",
      phone:   customer.phone_number || "",
      vehicle: vehicle
        ? `${vehicle.make || ""} ${vehicle.model || ""} · ${vehicle.vehicle_number}`.trim()
        : "",
      kms_run: bill.kms_run || null,
    },
    items: [...items]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((i) => ({
        description: i.description,
        qty:         i.quantity,
        rate:        Number(i.unit_price),
        amount:      Number(i.total_price ?? i.quantity * i.unit_price),
      })),
    charges: {
      subtotal:  Number(bill.subtotal),
      discount:  Number(bill.discount  || 0),
      taxRate:   bill.gst_enabled ? (bill.gst_rate ?? 18) : 0,
      taxAmount: Number(bill.tax_amount || 0),
      total:     Number(bill.total_amount),
      paidAmount: Number(bill.paid_amount || 0),
      balanceDue: Number(bill.total_amount) - Number(bill.paid_amount || 0),
    },
    payment: {
      method:        profile?.payment_methods || process.env.NEXT_PUBLIC_PAYMENT_METHODS || "UPI / Bank Transfer / Cash",
      upiId:         profile?.upi_id          || process.env.NEXT_PUBLIC_UPI_ID          || "",
      bankName:      profile?.bank_name        || process.env.NEXT_PUBLIC_BANK_NAME       || "",
      accountNumber: profile?.account_number   || process.env.NEXT_PUBLIC_ACCOUNT_NUMBER  || "",
      ifsc:          profile?.ifsc             || process.env.NEXT_PUBLIC_IFSC            || "",
      notes:         bill.notes || profile?.invoice_notes || "Thank you for your business.",
    },
  };
}

async function renderInvoiceHtml(templateData) {
  let html = await ejs.renderFile(TEMPLATE_PATH, templateData, { async: false });
  html = html
    .replace(/<link[^>]+fonts\.googleapis[^>]+>/g, "")
    .replace(/<link[^>]+fonts\.gstatic[^>]+>/g,   "")
    .replace(/<link[^>]+invoice\.css[^>]+>/,       cssAsInlineTag());
  return applyRupeeSpan(html);
}

// ── GET — browser preview with sample data ────────────────────────────────────

export async function GET() {
  try {
    const sample = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "shree-royal-invoice", "data", "sample-invoice.json"),
        "utf-8"
      )
    );

    // Wrap sample data in the same shape buildTemplateData expects
    const templateData = {
      ...sample,
      company: { ...sample.company, logo: logoAsDataUrl() },
    };

    let html = await ejs.renderFile(TEMPLATE_PATH, templateData, { async: false });
    html = html
      .replace(/<link[^>]+fonts\.googleapis[^>]+>/g, "")
      .replace(/<link[^>]+fonts\.gstatic[^>]+>/g,   "")
      .replace(/<link[^>]+invoice\.css[^>]+>/,       cssAsInlineTag());
    html = applyRupeeSpan(html);

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("[generate-invoice GET]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── POST — return rendered HTML for client-side browser print ─────────────────

export async function POST(request) {
  try {
    const { bill, items, customer, vehicle, profile: clientProfile } = await request.json();

    let profile = clientProfile;

    if (!profile) {
      // Fetch business profile from Supabase (falls back to env vars if unavailable)
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        );
        const { data } = await supabase
          .from("business_profile")
          .select("*")
          .limit(1)
          .single();
        profile = data;
      } catch (_) { /* use env var fallbacks */ }
    }

    const templateData = buildTemplateData({ bill, items, customer, vehicle, profile });
    const html = await renderInvoiceHtml(templateData);

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("[generate-invoice POST]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
