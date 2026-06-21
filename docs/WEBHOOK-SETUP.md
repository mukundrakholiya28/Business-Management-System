# Database Webhook Setup Guide

## Overview

This guide explains how to set up Supabase Database Webhooks to send real-time notifications when invoices are created or updated.

---

## 🎯 What Webhooks Do

When a new invoice is created or an existing invoice's status changes (e.g., from "pending" to "paid"), Supabase can automatically:
- Send a POST request to your API endpoint
- Include the invoice details in the request body
- Trigger actions like sending WhatsApp notifications

---

## 📋 Setup Steps

### 1. **Create the Webhook Endpoint**

Your application already has a webhook endpoint at:
```
POST /api/webhooks/invoice-status
```

This endpoint:
- Validates the webhook signature (security)
- Processes invoice creation/update events
- Sends WhatsApp notifications with invoice links

### 2. **Configure in Supabase Dashboard**

1. Go to **Database → Webhooks** in your Supabase dashboard
2. Click **Enable Webhooks** (if not already enabled)
3. Click **Create a new hook**

### 3. **Webhook Configuration**

**Hook Name:** `invoice-status-webhook`

**Table:** `bills`

**Events to send:** 
- ✅ INSERT
- ✅ UPDATE

**Type of hook:** HTTP Request

**HTTP Request:**
- **Method:** POST
- **URL:** `https://your-domain.vercel.app/api/webhooks/invoice-status`
  - Replace with your deployed Vercel URL
  - For local testing: Use [ngrok](https://ngrok.com/) to expose `http://localhost:3000`

**HTTP Headers:**
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer YOUR_WEBHOOK_SECRET"
}
```
- Replace `YOUR_WEBHOOK_SECRET` with a random string (save this in `.env.local` as `WEBHOOK_SECRET`)

**HTTP Params (Payload):**
```json
{
  "type": "{{ event.type }}",
  "table": "{{ event.table }}",
  "record": "{{ event.record }}",
  "old_record": "{{ event.old_record }}"
}
```

### 4. **Add Webhook Secret to Environment**

Add to `.env.local`:
```env
WEBHOOK_SECRET=your-random-secret-here
```

Generate a secure random string:
```bash
# On Linux/Mac
openssl rand -base64 32

# On Windows (PowerShell)
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

### 5. **Deploy and Test**

```bash
# Deploy to Vercel
vercel --prod

# Or for local testing with ngrok
ngrok http 3000
# Use the ngrok URL in webhook configuration
```

---

## 🧪 Testing the Webhook

### Manual Test from Supabase Dashboard

1. Go to **Database → Webhooks**
2. Find your webhook
3. Click **Send test event**
4. Select event type (INSERT or UPDATE)
5. Check your webhook endpoint logs

### Test by Creating an Invoice

1. Log in to your application
2. Create a new invoice
3. Check the webhook logs in Supabase
4. Verify WhatsApp notification was sent

---

## 🛠️ Webhook Endpoint Details

File: `src/app/api/webhooks/invoice-status/route.js`

**What it does:**
1. Validates the webhook signature
2. Extracts invoice details (customer, amount, status)
3. Generates invoice PDF link
4. Sends WhatsApp message with invoice details

**Payload Structure:**
```json
{
  "type": "INSERT",
  "table": "bills",
  "record": {
    "id": "uuid",
    "bill_number": 123,
    "customer_id": "uuid",
    "total_amount": 5000,
    "status": "pending",
    "created_at": "2026-06-21T...",
    ...
  }
}
```

---

## 🔐 Security Considerations

### Webhook Authentication
The endpoint validates requests using:
1. **Signature Header:** `Authorization: Bearer YOUR_SECRET`
2. **Environment Variable:** Matches against `WEBHOOK_SECRET`
3. **Rejects unauthorized requests** with 401

### Best Practices
- ✅ Use HTTPS in production (Vercel provides this automatically)
- ✅ Keep webhook secret in environment variables (never commit)
- ✅ Validate webhook payload structure before processing
- ✅ Use Supabase RLS to ensure webhook can only read authorized data

---

## 🚨 Troubleshooting

### Issue: Webhook returns 401 Unauthorized

**Cause:** Webhook secret mismatch

**Fix:**
1. Check `.env.local` has `WEBHOOK_SECRET`
2. Verify Supabase webhook has matching `Authorization` header
3. Redeploy after updating environment variables

---

### Issue: No WhatsApp messages sent

**Cause:** WhatsApp API credentials not configured

**Fix:**
1. Check `.env.local` has:
   - `WHATSAPP_API_URL`
   - `WHATSAPP_API_TOKEN`
2. Verify WhatsApp API is accessible
3. Check webhook logs for error messages

---

### Issue: Webhook not triggering

**Cause:** Webhook disabled or URL incorrect

**Fix:**
1. Check webhook is enabled in Supabase dashboard
2. Verify URL is correct (including HTTPS)
3. Test webhook manually from dashboard
4. Check Supabase webhook logs for delivery errors

---

## 📊 Monitoring

### View Webhook Logs

**In Supabase:**
1. Go to **Database → Webhooks**
2. Click on your webhook
3. View **Logs** tab for delivery history

**In Vercel:**
1. Go to your project dashboard
2. Click **Functions**
3. Find `/api/webhooks/invoice-status`
4. View real-time logs

---

## 🎉 Summary

✅ **Webhook endpoint created** — `/api/webhooks/invoice-status`  
✅ **Secure authentication** — Bearer token validation  
✅ **Auto-notifications** — WhatsApp messages on invoice events  
✅ **Production ready** — HTTPS + environment-based configuration

Configure the webhook in Supabase dashboard and you're ready to go!
