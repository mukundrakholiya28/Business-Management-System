import { NextResponse } from "next/server";

/**
 * POST /api/send-whatsapp
 *
 * Sends a WhatsApp template message via Meta Cloud API v25.0.
 * Template: jaspers_market_order_confirmation_v1
 * Parameters: [customerName, invoiceNumber, date]
 *
 * Body: {
 *   to: "918200915780",
 *   customerName: "Rajesh Patel",
 *   invoiceNumber: "INV-1005",
 *   date: "Jun 20, 2026"
 * }
 */
export async function POST(request) {
  try {
    const { to, customerName, invoiceNumber, date } = await request.json();

    if (!to || !customerName || !invoiceNumber) {
      return NextResponse.json(
        { error: "Missing required fields: to, customerName, invoiceNumber" },
        { status: 400 }
      );
    }

    const token   = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneId) {
      return NextResponse.json(
        { error: "WhatsApp API not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in .env" },
        { status: 503 }
      );
    }

    // E.164 digits only — strip spaces, dashes, +
    const recipient = to.replace(/\D/g, "");

    const formattedDate = date || new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    const payload = {
      messaging_product: "whatsapp",
      to: recipient,
      type: "template",
      template: {
        name: "jaspers_market_order_confirmation_v1",
        language: { code: "en_US" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: customerName },
              { type: "text", text: invoiceNumber },
              { type: "text", text: formattedDate },
            ],
          },
        ],
      },
    };

    const res = await fetch(
      `https://graph.facebook.com/v25.0/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      console.error("[WhatsApp API error]", JSON.stringify(data, null, 2));
      return NextResponse.json(
        { error: data?.error?.message || "WhatsApp API request failed", details: data },
        { status: res.status }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: data?.messages?.[0]?.id,
    });
  } catch (err) {
    console.error("[send-whatsapp route error]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
