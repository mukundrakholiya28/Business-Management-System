/**
 * WhatsApp Cloud API Webhook
 * ──────────────────────────
 * GET  /api/whatsapp-webhook  — Meta verification handshake
 * POST /api/whatsapp-webhook  — Incoming messages & status updates
 *
 * Setup:
 *  1. Set WHATSAPP_WEBHOOK_VERIFY_TOKEN in .env (any secret string you choose)
 *  2. In Meta App Dashboard → WhatsApp → Configuration → Webhooks:
 *       Callback URL : https://<your-domain>/api/whatsapp-webhook
 *       Verify token : <same value as WHATSAPP_WEBHOOK_VERIFY_TOKEN>
 *  3. Subscribe to the "messages" field under the whatsapp_business_account object
 */

import { NextResponse } from "next/server";

// ─── GET — verification handshake ────────────────────────────────────────────

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (!verifyToken) {
    console.error("[whatsapp-webhook] WHATSAPP_WEBHOOK_VERIFY_TOKEN is not set");
    return new Response("Webhook verify token not configured", { status: 500 });
  }

  if (mode === "subscribe" && token === verifyToken) {
    console.log("[whatsapp-webhook] Webhook verified successfully");
    // Meta requires a plain-text response with the challenge value
    return new Response(challenge, { status: 200 });
  }

  console.warn("[whatsapp-webhook] Verification failed — token mismatch or wrong mode");
  return new Response("Forbidden", { status: 403 });
}

// ─── POST — incoming events ───────────────────────────────────────────────────

export async function POST(request) {
  try {
    const body = await request.json();

    // Meta always wraps payloads in { object: "whatsapp_business_account", entry: [...] }
    if (body.object !== "whatsapp_business_account") {
      return NextResponse.json({ status: "ignored" }, { status: 200 });
    }

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;

        // ── Incoming messages ─────────────────────────────────────────────
        for (const message of value?.messages ?? []) {
          await handleIncomingMessage(message, value.metadata, value.contacts);
        }

        // ── Status updates (sent / delivered / read / failed) ─────────────
        for (const status of value?.statuses ?? []) {
          await handleStatusUpdate(status);
        }
      }
    }

    // Always respond 200 quickly so Meta doesn't retry
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (err) {
    console.error("[whatsapp-webhook] Error processing payload:", err);
    // Still return 200 to prevent Meta from disabling the webhook
    return NextResponse.json({ status: "error", message: err.message }, { status: 200 });
  }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

/**
 * Handle an incoming WhatsApp message.
 *
 * @param {object} message  - The message object from Meta
 * @param {object} metadata - Phone number metadata (phone_number_id, display_phone_number)
 * @param {Array}  contacts - Sender profile info
 */
async function handleIncomingMessage(message, metadata, contacts) {
  const sender      = message.from;                        // E.164 number, no "+"
  const messageId   = message.id;
  const timestamp   = new Date(Number(message.timestamp) * 1000).toISOString();
  const senderName  = contacts?.[0]?.profile?.name ?? sender;

  let text = null;

  switch (message.type) {
    case "text":
      text = message.text?.body;
      break;
    case "image":
    case "video":
    case "audio":
    case "document":
      text = `[${message.type} received]`;
      break;
    case "button":
      text = message.button?.text;
      break;
    case "interactive":
      text =
        message.interactive?.button_reply?.title ??
        message.interactive?.list_reply?.title ??
        "[interactive]";
      break;
    default:
      text = `[${message.type}]`;
  }

  console.log(
    `[whatsapp-webhook] Message from ${senderName} (${sender}) at ${timestamp}: ${text}`
  );

  // TODO: persist to Supabase, trigger a reply, update order status, etc.
  // Example:
  // await supabase.from("whatsapp_messages").insert({
  //   phone: sender,
  //   name: senderName,
  //   message: text,
  //   message_id: messageId,
  //   received_at: timestamp,
  // });
}

/**
 * Handle a message status update (sent → delivered → read, or failed).
 *
 * @param {object} status - The status object from Meta
 */
async function handleStatusUpdate(status) {
  const { id: messageId, status: state, timestamp, recipient_id, errors } = status;

  const ts = new Date(Number(timestamp) * 1000).toISOString();

  if (state === "failed") {
    const errCode = errors?.[0]?.code;
    const errMsg  = errors?.[0]?.message;
    console.error(
      `[whatsapp-webhook] Message ${messageId} to ${recipient_id} FAILED at ${ts}: [${errCode}] ${errMsg}`
    );
  } else {
    console.log(
      `[whatsapp-webhook] Message ${messageId} to ${recipient_id} — ${state} at ${ts}`
    );
  }

  // TODO: update message status in your database
  // await supabase.from("whatsapp_messages").update({ status: state }).eq("message_id", messageId);
}
