import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM   = process.env.RESEND_FROM_EMAIL || "Shree Royal Car <onboarding@resend.dev>";

/**
 * POST /api/send-email
 * Body: {
 *   to:            "customer@email.com",
 *   customerName:  "Rajesh Patel",
 *   invoiceNumber: "INV-1005",
 *   date:          "20 Jun 2026",
 *   vehicle:       "GJ01AB1234 — Maruti Swift",
 *   items:         [{ description, quantity, unit_price, total_price }],
 *   subtotal:      4500,
 *   taxAmount:     810,
 *   discount:      200,
 *   totalAmount:   5110,
 *   status:        "paid",
 *   paymentMethod: "cash",
 *   notes:         "Full service",
 * }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      to, customerName, invoiceNumber, date,
      vehicle, items = [],
      subtotal, taxAmount, discount, totalAmount,
      status, paymentMethod, notes,
    } = body;

    if (!to || !customerName || !invoiceNumber) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: "RESEND_API_KEY not configured in .env" }, { status: 503 });
    }

    const statusColor = {
      paid:      "#16A34A",
      pending:   "#D97706",
      draft:     "#6B7280",
      cancelled: "#DC2626",
    }[status] || "#6B7280";

    const statusBg = {
      paid:      "#ECFDF5",
      pending:   "#FFFBEB",
      draft:     "#F3F4F6",
      cancelled: "#FEF2F2",
    }[status] || "#F3F4F6";

    const fmt = (n) =>
      new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0 }).format(n || 0);

    const itemRows = items
      .map(
        (item, i) => `
        <tr style="border-bottom:1px solid #F3F4F6;">
          <td style="padding:10px 12px;color:#6B7280;font-size:12px;">${i + 1}</td>
          <td style="padding:10px 12px;color:#374151;">${item.description}</td>
          <td style="padding:10px 12px;text-align:right;color:#6B7280;">${item.quantity}</td>
          <td style="padding:10px 12px;text-align:right;color:#6B7280;">${fmt(item.unit_price)}</td>
          <td style="padding:10px 12px;text-align:right;font-weight:600;color:#111827;">${fmt(item.total_price)}</td>
        </tr>`
      )
      .join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice ${invoiceNumber}</title></head>
<body style="margin:0;padding:0;background:#F4F5F7;font-family:'Inter',system-ui,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 8px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:#1A1D27;padding:28px 32px;display:flex;align-items:center;gap:16px;">
      <div>
        <h1 style="margin:0;color:#F59E0B;font-size:20px;font-weight:700;letter-spacing:1px;">SHREE ROYAL CAR</h1>
        <p style="margin:4px 0 0;color:#9CA3AF;font-size:12px;">Car Workshop &amp; Service Centre</p>
      </div>
    </div>

    <!-- Invoice Meta -->
    <div style="padding:28px 32px 0;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
        <div>
          <p style="margin:0;font-size:22px;font-weight:700;color:#111827;">${invoiceNumber}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#6B7280;">${date}</p>
        </div>
        <span style="display:inline-block;padding:4px 14px;border-radius:999px;font-size:12px;font-weight:600;text-transform:capitalize;background:${statusBg};color:${statusColor};">${status}</span>
      </div>

      <!-- Customer + Vehicle -->
      <div style="display:flex;gap:12px;margin-top:24px;flex-wrap:wrap;">
        <div style="flex:1;min-width:200px;background:#F9FAFB;border-radius:12px;padding:16px;">
          <p style="margin:0 0 8px;font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#9CA3AF;">Bill To</p>
          <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">${customerName}</p>
        </div>
        <div style="flex:1;min-width:200px;background:#F9FAFB;border-radius:12px;padding:16px;">
          <p style="margin:0 0 8px;font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#9CA3AF;">Vehicle</p>
          <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">${vehicle || "—"}</p>
        </div>
      </div>

      <!-- Line Items -->
      <table style="width:100%;border-collapse:collapse;margin-top:24px;">
        <thead>
          <tr style="background:#F9FAFB;">
            <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#9CA3AF;">#</th>
            <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#9CA3AF;">Description</th>
            <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#9CA3AF;">Qty</th>
            <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#9CA3AF;">Price</th>
            <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#9CA3AF;">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <!-- Totals -->
      <div style="background:#F9FAFB;border-radius:12px;padding:16px;margin-top:16px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;color:#6B7280;margin-bottom:6px;"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:13px;color:#6B7280;margin-bottom:6px;"><span>Tax (18% GST)</span><span>${fmt(taxAmount)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:13px;color:#6B7280;margin-bottom:10px;"><span>Discount</span><span>-${fmt(discount)}</span></div>
        <div style="height:1px;background:#E5E7EB;margin-bottom:10px;"></div>
        <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:700;color:#111827;"><span>Total</span><span>${fmt(totalAmount)}</span></div>
        ${paymentMethod ? `<p style="margin:8px 0 0;font-size:11px;color:#9CA3AF;">Payment: <strong style="color:#6B7280;text-transform:capitalize;">${paymentMethod}</strong></p>` : ""}
      </div>

      ${notes ? `<p style="margin:16px 0 0;font-size:12px;color:#9CA3AF;"><strong style="color:#6B7280;">Notes:</strong> ${notes}</p>` : ""}
    </div>

    <!-- Footer -->
    <div style="padding:24px 32px;margin-top:24px;text-align:center;border-top:1px solid #F3F4F6;">
      <p style="margin:0;font-size:12px;color:#9CA3AF;">Thank you for choosing <strong style="color:#F59E0B;">Shree Royal Car</strong></p>
      <p style="margin:4px 0 0;font-size:11px;color:#D1D5DB;">This is a system-generated invoice.</p>
    </div>
  </div>
</body>
</html>`;

    const { data, error } = await resend.emails.send({
      from: FROM,
      to: [to],
      subject: `Invoice ${invoiceNumber} from Shree Royal Car`,
      html,
    });

    if (error) {
      console.error("[Resend error]", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, emailId: data?.id });
  } catch (err) {
    console.error("[send-email route error]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
