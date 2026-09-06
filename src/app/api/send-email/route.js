import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { authenticateRequest, getSupabaseClient } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

const SMTP_HOST = process.env.SMTP_HOST || "smtp.resend.com";
const SMTP_PORT = Number.parseInt(process.env.SMTP_PORT || "465", 10);
const SMTP_USER = process.env.SMTP_USER || "resend";
const SMTP_PASS = process.env.SMTP_PASS || process.env.RESEND_API_KEY || "";
const SMTP_SECURE = process.env.SMTP_SECURE === "true" || SMTP_PORT === 465;
const FROM = process.env.SMTP_FROM || process.env.RESEND_FROM_EMAIL || "Shree Royal Car <onboarding@resend.dev>";

const MAX_REQUEST_BYTES = 14 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_EMAILS_PER_WINDOW = 10;
const EMAIL_WINDOW_MS = 10 * 60 * 1000;
const emailAttempts = new Map();

function jsonError(message, status, headers = {}) {
  return NextResponse.json({ error: message }, { status, headers });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCurrency(value) {
  const amount = Number(value);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function isUuid(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isEmail(value) {
  return typeof value === "string" &&
    value.length <= 254 &&
    !/[\r\n]/.test(value) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function checkEmailRateLimit(userId) {
  const now = Date.now();
  const existing = emailAttempts.get(userId);
  const current = !existing || now >= existing.resetAt
    ? { count: 0, resetAt: now + EMAIL_WINDOW_MS }
    : existing;

  if (current.count >= MAX_EMAILS_PER_WINDOW) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }

  current.count += 1;
  emailAttempts.set(userId, current);

  if (emailAttempts.size > 500) {
    for (const [key, value] of emailAttempts) {
      if (value.resetAt <= now) emailAttempts.delete(key);
    }
  }

  return { allowed: true };
}

function getSafeSignedPdfUrl(value) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > 4096) {
    throw new Error("The PDF link is invalid.");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("Invoice storage is not configured.");
  }

  let url;
  let expectedOrigin;
  try {
    url = new URL(value);
    expectedOrigin = new URL(supabaseUrl).origin;
  } catch {
    throw new Error("The PDF link is invalid.");
  }

  if (
    url.origin !== expectedOrigin ||
    !url.pathname.includes("/storage/v1/object/sign/invoices/") ||
    !url.searchParams.get("token")
  ) {
    throw new Error("The PDF link is invalid.");
  }

  return url.toString();
}

function getPdfAttachment(base64, invoiceNumber) {
  if (base64 == null || base64 === "") return null;

  if (
    typeof base64 !== "string" ||
    base64.length > Math.ceil(MAX_PDF_BYTES * 4 / 3) + 8 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)
  ) {
    throw new Error("The PDF attachment is invalid.");
  }

  const content = Buffer.from(base64, "base64");
  if (
    content.length === 0 ||
    content.length > MAX_PDF_BYTES ||
    content.subarray(0, 5).toString("ascii") !== "%PDF-"
  ) {
    throw new Error("The PDF attachment is invalid.");
  }

  return {
    filename: `${invoiceNumber.replace(/[^A-Z0-9_-]/gi, "_")}.pdf`,
    content,
    contentType: "application/pdf",
  };
}

function singleRelation(value) {
  return Array.isArray(value) ? value[0] : value;
}

async function loadInvoiceForEmail(client, billId) {
  const { data, error } = await client
    .from("bills")
    .select(`
      id, bill_number, created_at, subtotal, tax_amount, discount,
      total_amount, paid_amount, status, payment_method, notes,
      customer:customers(name, email),
      vehicle:vehicles(vehicle_number, make, model),
      items:bill_items(description, quantity, unit_price, total_price, sort_order)
    `)
    .eq("id", billId)
    .single();

  if (error || !data) {
    throw new Error("Invoice not found or not available.");
  }

  const customer = singleRelation(data.customer);
  if (!isEmail(customer?.email)) {
    throw new Error("The customer does not have a valid email address on file.");
  }

  return {
    bill: data,
    customer,
    vehicle: singleRelation(data.vehicle),
    items: Array.isArray(data.items) ? data.items : [],
  };
}

function renderInvoiceEmail({ bill, customer, vehicle, items, pdfUrl }) {
  const invoiceNumber = `INV-${Number(bill.bill_number)}`;
  const customerName = escapeHtml(customer.name || "Customer");
  const vehicleLabel = [vehicle?.make, vehicle?.model, vehicle?.vehicle_number]
    .filter(Boolean)
    .join(" · ") || "—";
  const allowedStatuses = new Set(["paid", "pending", "partially_paid", "draft", "cancelled"]);
  const status = allowedStatuses.has(bill.status) ? bill.status : "draft";
  const statusLabel = status === "partially_paid" ? "Partially paid" : status;
  const statusColors = {
    paid: ["#ECFDF5", "#16A34A"],
    pending: ["#FFFBEB", "#D97706"],
    partially_paid: ["#EFF6FF", "#2563EB"],
    draft: ["#F3F4F6", "#6B7280"],
    cancelled: ["#FEF2F2", "#DC2626"],
  };
  const [statusBackground, statusColor] = statusColors[status];
  const invoiceDate = new Date(bill.created_at).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
  const itemRows = items
    .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
    .slice(0, 200)
    .map((item, index) => `
      <tr style="border-bottom:1px solid #F3F4F6;">
        <td style="padding:10px 12px;color:#6B7280;font-size:12px;">${index + 1}</td>
        <td style="padding:10px 12px;color:#374151;">${escapeHtml(item.description)}</td>
        <td style="padding:10px 12px;text-align:right;color:#6B7280;">${escapeHtml(item.quantity)}</td>
        <td style="padding:10px 12px;text-align:right;color:#6B7280;">${formatCurrency(item.unit_price)}</td>
        <td style="padding:10px 12px;text-align:right;font-weight:600;color:#111827;">${formatCurrency(item.total_price)}</td>
      </tr>`)
    .join("");

  const taxAmount = Number(bill.tax_amount) || 0;
  const discount = Number(bill.discount) || 0;
  const paidAmount = Number(bill.paid_amount) || 0;
  const totalAmount = Number(bill.total_amount) || 0;

  return {
    invoiceNumber,
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice ${escapeHtml(invoiceNumber)}</title></head>
<body style="margin:0;padding:0;background:#F4F5F7;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 8px rgba(0,0,0,0.08);">
    <div style="background:#1A1D27;padding:28px 32px;"><h1 style="margin:0;color:#F59E0B;font-size:20px;letter-spacing:1px;">SHREE ROYAL CAR</h1><p style="margin:4px 0 0;color:#9CA3AF;font-size:12px;">Car Workshop &amp; Service Centre</p></div>
    <div style="padding:32px 32px 16px;"><h2 style="margin:0 0 12px;font-size:18px;color:#111827;">Hello ${customerName},</h2><p style="margin:0;font-size:14px;color:#4B5563;line-height:1.6;">Thank you for trusting Shree Royal Car. Your invoice <strong>${escapeHtml(invoiceNumber)}</strong> is attached for your records.</p></div>
    <div style="padding:16px 32px 32px;">
      <div style="display:flex;justify-content:space-between;gap:12px;"><div><p style="margin:0;font-size:22px;font-weight:700;color:#111827;">${escapeHtml(invoiceNumber)}</p><p style="margin:4px 0 0;font-size:13px;color:#6B7280;">${escapeHtml(invoiceDate)}</p></div><span style="padding:4px 14px;border-radius:999px;font-size:12px;color:${statusColor};background:${statusBackground};">${escapeHtml(statusLabel)}</span></div>
      <div style="display:flex;gap:12px;margin-top:24px;flex-wrap:wrap;"><div style="flex:1;min-width:200px;background:#F9FAFB;border-radius:12px;padding:16px;"><p style="margin:0 0 8px;font-size:10px;text-transform:uppercase;color:#9CA3AF;">Bill To</p><p style="margin:0;font-size:14px;font-weight:600;color:#111827;">${customerName}</p></div><div style="flex:1;min-width:200px;background:#F9FAFB;border-radius:12px;padding:16px;"><p style="margin:0 0 8px;font-size:10px;text-transform:uppercase;color:#9CA3AF;">Vehicle</p><p style="margin:0;font-size:14px;font-weight:600;color:#111827;">${escapeHtml(vehicleLabel)}</p></div></div>
      <table style="width:100%;border-collapse:collapse;margin-top:24px;"><thead><tr style="background:#F9FAFB;"><th style="padding:10px 12px;text-align:left;font-size:10px;color:#9CA3AF;">#</th><th style="padding:10px 12px;text-align:left;font-size:10px;color:#9CA3AF;">Description</th><th style="padding:10px 12px;text-align:right;font-size:10px;color:#9CA3AF;">Qty</th><th style="padding:10px 12px;text-align:right;font-size:10px;color:#9CA3AF;">Price</th><th style="padding:10px 12px;text-align:right;font-size:10px;color:#9CA3AF;">Total</th></tr></thead><tbody>${itemRows}</tbody></table>
      <div style="background:#F9FAFB;border-radius:12px;padding:16px;margin-top:16px;"><div style="display:flex;justify-content:space-between;font-size:13px;color:#6B7280;margin-bottom:6px;"><span>Subtotal</span><span>${formatCurrency(bill.subtotal)}</span></div>${taxAmount > 0 ? `<div style="display:flex;justify-content:space-between;font-size:13px;color:#6B7280;margin-bottom:6px;"><span>Tax</span><span>${formatCurrency(taxAmount)}</span></div>` : ""}${discount > 0 ? `<div style="display:flex;justify-content:space-between;font-size:13px;color:#6B7280;margin-bottom:10px;"><span>Discount</span><span>-${formatCurrency(discount)}</span></div>` : ""}<div style="height:1px;background:#E5E7EB;margin-bottom:10px;"></div><div style="display:flex;justify-content:space-between;font-size:16px;font-weight:700;color:#111827;"><span>Total</span><span>${formatCurrency(totalAmount)}</span></div>${paidAmount > 0 ? `<div style="display:flex;justify-content:space-between;font-size:13px;color:#6B7280;margin-top:8px;"><span>Amount paid</span><span>${formatCurrency(paidAmount)}</span></div>` : ""}</div>
      ${bill.notes ? `<p style="margin:16px 0 0;font-size:12px;color:#6B7280;"><strong>Notes:</strong> ${escapeHtml(bill.notes)}</p>` : ""}
      ${pdfUrl ? `<div style="text-align:center;margin-top:28px;"><a href="${escapeHtml(pdfUrl)}" style="display:inline-block;padding:12px 24px;background:#F59E0B;color:#fff;text-decoration:none;font-weight:600;border-radius:8px;font-size:14px;">Download PDF Invoice</a></div>` : ""}
    </div>
    <div style="padding:24px 32px;text-align:center;border-top:1px solid #F3F4F6;"><p style="margin:0;font-size:12px;color:#9CA3AF;">Thank you for choosing Shree Royal Car.</p></div>
  </div>
</body>
</html>`,
  };
}

/**
 * Sends an invoice only after loading its customer, vehicle, and totals through
 * the caller's RLS-scoped database client. The browser never chooses a recipient.
 */
export async function POST(request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return jsonError("Request payload is too large.", 413);
  }

  const authResult = await authenticateRequest(request);
  if (!authResult.authenticated) {
    return jsonError("Authentication is required.", 401);
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  if (!input || typeof input !== "object" || !isUuid(input.billId)) {
    return jsonError("A valid invoice ID is required.", 400);
  }

  if (!SMTP_PASS) {
    logger.error("Email delivery is not configured");
    return jsonError("Email delivery is not configured.", 503);
  }

  try {
    const client = getSupabaseClient(authResult.token);
    if (!client) {
      return jsonError("Email delivery is not configured.", 503);
    }

    const invoice = await loadInvoiceForEmail(client, input.billId);
    const rateLimit = checkEmailRateLimit(authResult.user.id);
    if (!rateLimit.allowed) {
      return jsonError("Too many email requests. Please try again shortly.", 429, {
        "Retry-After": String(rateLimit.retryAfter),
      });
    }

    const pdfUrl = getSafeSignedPdfUrl(input.pdfUrl);
    const rendered = renderInvoiceEmail({ ...invoice, pdfUrl });
    const attachment = getPdfAttachment(input.pdfBase64, rendered.invoiceNumber);
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    const info = await transporter.sendMail({
      from: FROM,
      to: invoice.customer.email,
      subject: `Invoice ${rendered.invoiceNumber} from Shree Royal Car`,
      html: rendered.html,
      attachments: attachment ? [attachment] : [],
    });

    return NextResponse.json({ success: true, emailId: info.messageId });
  } catch (error) {
    logger.error("Invoice email delivery failed", error, { billId: input.billId });
    const clientMessage = error.message === "Invoice not found or not available." ||
      error.message === "The customer does not have a valid email address on file." ||
      error.message.startsWith("The PDF") ||
      error.message === "Invoice storage is not configured."
      ? error.message
      : "Could not send the invoice email. Please try again later.";
    return jsonError(clientMessage, 400);
  }
}
