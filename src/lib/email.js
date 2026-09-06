import { supabase } from "@/lib/supabase";

/**
 * Send an invoice email via the internal API route.
 * The route reloads invoice data through RLS, so callers cannot choose a
 * different recipient or alter financial details in transit.
 * @param {{ bill, pdfBase64, pdfUrl }} params
 */
export async function sendInvoiceEmail({ bill, pdfBase64, pdfUrl }) {
  if (!bill?.id) throw new Error("A saved invoice is required before sending email.");
  if (!supabase) throw new Error("Supabase is not configured.");

  // Get current session token for API authorization
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch("/api/send-email", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      billId:        bill.id,
      pdfBase64,
      pdfUrl,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Failed to send email");
  return data;
}
