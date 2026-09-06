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
import crypto from "crypto";
import { logger } from "@/lib/logger";

const MAX_WEBHOOK_BYTES = 256 * 1024;

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left || "");
  const rightBuffer = Buffer.from(right || "");

  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

// ─── GET — verification handshake ────────────────────────────────────────────

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (!verifyToken) {
    logger.error("WHATSAPP_WEBHOOK_VERIFY_TOKEN is not set in environment");
    return new Response("Webhook verify token not configured", { status: 500 });
  }

  if (mode === "subscribe" && challenge && safeEqual(token, verifyToken)) {
    logger.info("Webhook verified successfully with Meta handshake");
    // Meta requires a plain-text response with the challenge value
    return new Response(challenge, { status: 200 });
  }

  logger.warn("Verification failed — token mismatch or wrong mode");
  return new Response("Forbidden", { status: 403 });
}

// ─── POST — incoming events ───────────────────────────────────────────────────

export async function POST(request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    logger.error("WHATSAPP_APP_SECRET is not set in environment");
    return new Response("Webhook signature verification is not configured", { status: 503 });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_WEBHOOK_BYTES) {
    return new Response("Payload too large", { status: 413 });
  }

  try {
    const signature = request.headers.get("x-hub-signature-256");
    const rawBody = await request.text();

    if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
      return new Response("Payload too large", { status: 413 });
    }

    const [algorithm, signatureHash] = signature?.split("=") || [];
    if (
      algorithm !== "sha256" ||
      !signatureHash ||
      !/^[a-f0-9]{64}$/i.test(signatureHash)
    ) {
      logger.warn("WhatsApp webhook signature is missing or malformed");
      return new Response("Unauthorized", { status: 401 });
    }

    const expectedHash = crypto
      .createHmac("sha256", appSecret)
      .update(rawBody)
      .digest("hex");

    if (!safeEqual(signatureHash, expectedHash)) {
      logger.warn("WhatsApp webhook signature verification failed");
      return new Response("Unauthorized", { status: 401 });
    }

    const body = JSON.parse(rawBody);

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
    logger.error("Error processing WhatsApp webhook payload", err);
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
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
  const messageId   = message.id;
  const timestamp   = new Date(Number(message.timestamp) * 1000).toISOString();

  // Do not log customer phone numbers, profile names, or message contents.
  logger.info("Incoming WhatsApp message received", {
    messageId,
    type: message.type || "unknown",
    timestamp,
  });

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
  const { id: messageId, status: state, timestamp, errors } = status;

  const ts = new Date(Number(timestamp) * 1000).toISOString();

  if (state === "failed") {
    const errCode = errors?.[0]?.code;
    const errMsg  = errors?.[0]?.message;
    logger.error("WhatsApp message status update failed", new Error(errMsg || "Unknown Error"), { messageId, errCode, timestamp: ts });
  } else {
    logger.info("WhatsApp message status update received", { messageId, state, timestamp: ts });
  }

  // TODO: update message status in your database
  // await supabase.from("whatsapp_messages").update({ status: state }).eq("message_id", messageId);
}
