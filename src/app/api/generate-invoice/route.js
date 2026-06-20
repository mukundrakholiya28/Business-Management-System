/**
 * POST /api/generate-invoice
 *
 * Accepts invoice data as JSON, renders the Shree Royal Car EJS template,
 * converts it to a PDF via Puppeteer (Chromium) and streams the PDF back.
 *
 * Works locally with puppeteer-core + system Chrome.
 * Works on Vercel with @sparticuz/chromium.
 *
 * Body shape — see /shree-royal-invoice/data/sample-invoice.json for reference.
 */

import { NextResponse } from "next/server";
import ejs from "ejs";
import path from "path";
import fs from "fs";

// Force Node.js runtime — required for fs, path, puppeteer, ejs
export const runtime = "nodejs";
// Give Puppeteer enough time on Vercel (max 60s on Pro, 10s on Hobby)
export const maxDuration = 60;

// ── Chromium / Puppeteer bootstrap ───────────────────────────────────────────

async function getBrowser() {
  // On Vercel (Lambda) use the pre-built Sparticuz Chromium binary.
  // Locally, fall back to puppeteer-core with whatever Chrome is installed.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = await import("puppeteer-core");
    return puppeteer.default.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }

  const puppeteer = await import("puppeteer-core");
  // Common Chrome locations on Windows / Mac / Linux
  const execPaths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ];
  const executablePath = execPaths.find((p) => fs.existsSync(p));
  if (!executablePath) throw new Error("Chrome not found. Install Chrome or set CHROME_PATH.");

  return puppeteer.default.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

// ── EJS template path ─────────────────────────────────────────────────────────

// The template lives in the monorepo alongside the Next.js app
const TEMPLATE_PATH = path.join(
  process.cwd(),
  "shree-royal-invoice",
  "views",
  "invoice.ejs"
);

// Public assets are served by Next.js at / — we inline the CSS directly so
// Puppeteer doesn't need to make a network request for it.
const CSS_PATH = path.join(process.cwd(), "public", "invoice.css");
const LOGO_PATH = path.join(process.cwd(), "public", "logo.png");

function logoAsDataUrl() {
  const buf = fs.readFileSync(LOGO_PATH);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

function cssAsInlineTag() {
  const css = fs.readFileSync(CSS_PATH, "utf-8");
  return `<style>${css}</style>`;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request) {
  try {
    const body = await request.json();

    // ── Build template data ───────────────────────────────────────────────────
    const {
      bill,
      items,
      customer,
      vehicle,
    } = body;

    const invoiceNumber = `SRC-${String(bill.bill_number).padStart(4, "0")}`;
    const invoiceDate = new Date(bill.created_at).toLocaleDateString("en-IN", {
      day: "2-digit", month: "long", year: "numeric",
    });

    // Due date = invoice date + 7 days
    const dueDate = new Date(new Date(bill.created_at).getTime() + 7 * 86400000)
      .toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

    const statusLabel =
      bill.status === "paid"      ? "Paid" :
      bill.status === "pending"   ? "Due"  :
      bill.status === "draft"     ? "Draft":
      bill.status === "cancelled" ? "Void" :
      bill.status;

    const templateData = {
      company: {
        name:        "Shree Royal Car",
        tagline:     "Automotive Repair & Car Wash",
        established: "2004",
        address:     "Ahmedabad, Gujarat",
        phone:       process.env.NEXT_PUBLIC_COMPANY_PHONE || "+91 98765 43210",
        email:       process.env.NEXT_PUBLIC_COMPANY_EMAIL || "billing@shreeroyalcar.in",
        gstin:       process.env.NEXT_PUBLIC_COMPANY_GSTIN || "",
        logo:        logoAsDataUrl(),   // embedded — no network request needed
      },
      invoice: {
        number:  invoiceNumber,
        date:    invoiceDate,
        dueDate,
        status:  statusLabel,
      },
      billTo: {
        name:    customer.name,
        address: customer.address || "",
        phone:   customer.phone_number || "",
        vehicle: vehicle
          ? `${vehicle.make || ""} ${vehicle.model || ""} · ${vehicle.vehicle_number}`
          : "",
      },
      items: items.map((i) => ({
        description: i.description,
        qty:         i.quantity,
        rate:        Number(i.unit_price),
        amount:      Number(i.total_price ?? i.quantity * i.unit_price),
      })),
      charges: {
        subtotal:  Number(bill.subtotal),
        discount:  Number(bill.discount || 0),
        taxRate:   bill.gst_enabled ? (bill.gst_rate ?? 18) : 0,
        taxAmount: Number(bill.tax_amount || 0),
        total:     Number(bill.total_amount),
      },
      payment: {
        method:        process.env.NEXT_PUBLIC_PAYMENT_METHODS || "UPI / Bank Transfer / Cash",
        upiId:         process.env.NEXT_PUBLIC_UPI_ID || "",
        bankName:      process.env.NEXT_PUBLIC_BANK_NAME || "",
        accountNumber: process.env.NEXT_PUBLIC_ACCOUNT_NUMBER || "",
        ifsc:          process.env.NEXT_PUBLIC_IFSC || "",
        notes:         bill.notes || "Thank you for your business.",
      },
    };

    // ── Render HTML ───────────────────────────────────────────────────────────
    let html = await ejs.renderFile(TEMPLATE_PATH, templateData, { async: false });

    // Inline the CSS so it works without a running web server.
    // Keep the Google Fonts link — Puppeteer will fetch it (networkidle0 below).
    // Add a safe fallback in case fonts don't load.
    html = html.replace(
      /<link[^>]+invoice\.css[^>]+>/,
      cssAsInlineTag() +
      `<style>
        /* Fallback if Google Fonts are unreachable */
        body { font-family: 'Poppins', 'Segoe UI', Arial, sans-serif; }
        .brand-text .name, .invoice-tag .label { font-family: 'Oswald', 'Arial Black', sans-serif; }
      </style>`
    );

    // ── Render PDF ────────────────────────────────────────────────────────────
    const browser = await getBrowser();
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: "networkidle0", timeout: 15000 });
    await page.evaluateHandle("document.fonts.ready");

    const pdf = await page.pdf({
      format:          "A4",
      printBackground: true,
      margin:          { top: "0", bottom: "0", left: "0", right: "0" },
    });

    await browser.close();

    // ── Return PDF ────────────────────────────────────────────────────────────
    return new Response(pdf, {
      status: 200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="INV-${bill.bill_number}.pdf"`,
      },
    });
  } catch (err) {
    console.error("[generate-invoice]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
