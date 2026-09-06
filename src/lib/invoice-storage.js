import { supabase } from "@/lib/supabase";

export const INVOICE_BUCKET = "invoices";

const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;
const EMAIL_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
  return supabase;
}

async function getCurrentUserId() {
  const client = requireSupabase();
  const { data: { user }, error } = await client.auth.getUser();

  if (error || !user) {
    throw new Error("You must be signed in to access invoice files.");
  }

  return user.id;
}

function decodePathSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new Error("The invoice file reference is invalid.");
  }
}

function getPathFromReference(reference) {
  if (typeof reference !== "string" || !reference.trim()) {
    throw new Error("No invoice file is available.");
  }

  const value = reference.trim();

  if (!/^https?:\/\//i.test(value)) {
    return value.split("?")[0].replace(/^\/+/, "");
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("The invoice file reference is invalid.");
  }

  // Supports records saved before the bucket was made private, while ensuring
  // all reads now go through Storage RLS rather than the old public URL.
  const parts = url.pathname.split("/").filter(Boolean).map(decodePathSegment);
  const bucketIndex = parts.lastIndexOf(INVOICE_BUCKET);

  if (bucketIndex === -1 || bucketIndex === parts.length - 1) {
    throw new Error("The invoice file reference is invalid.");
  }

  return parts.slice(bucketIndex + 1).join("/");
}

async function resolveOwnedPath(reference) {
  const userId = await getCurrentUserId();
  const filePath = getPathFromReference(reference);
  const segments = filePath.split("/");

  if (
    segments.length < 2 ||
    segments.some((segment) => !segment || segment === "." || segment === "..") ||
    (segments[0] !== userId && segments[0] !== "anonymous") ||
    !filePath.toLowerCase().endsWith(".pdf")
  ) {
    throw new Error("You do not have access to this invoice file.");
  }

  return filePath;
}

/** Upload an invoice into the authenticated user's private Storage folder. */
export async function uploadInvoicePdf(bill, pdfBlob) {
  if (!bill?.bill_number || !pdfBlob) {
    throw new Error("A bill number and PDF are required to store an invoice.");
  }

  const client = requireSupabase();
  const userId = await getCurrentUserId();
  const billNumber = Number(bill.bill_number);

  if (!Number.isInteger(billNumber) || billNumber < 1) {
    throw new Error("The invoice number is invalid.");
  }

  const filePath = `${userId}/INV-${billNumber}.pdf`;
  let { error } = await client.storage.from(INVOICE_BUCKET).upload(filePath, pdfBlob, {
    contentType: "application/pdf",
    upsert: true,
    cacheControl: "0",
  });

  if (error && error.message?.toLowerCase().includes("not found")) {
    await client.storage.createBucket(INVOICE_BUCKET, { public: false }).catch(() => {});
    const retry = await client.storage.from(INVOICE_BUCKET).upload(filePath, pdfBlob, {
      contentType: "application/pdf",
      upsert: true,
      cacheControl: "0",
    });
    error = retry.error;
  }

  if (error) {
    throw new Error(`Could not store the invoice PDF: ${error.message}`);
  }

  // Store the object path in bills.pdf_url; never persist a public or signed URL.
  return filePath;
}

/** Return a short-lived signed URL for opening an invoice in the browser. */
export async function createInvoiceDownloadUrl(reference, expiresIn = DOWNLOAD_URL_TTL_SECONDS) {
  const client = requireSupabase();
  const filePath = await resolveOwnedPath(reference);
  const { data, error } = await client.storage
    .from(INVOICE_BUCKET)
    .createSignedUrl(filePath, expiresIn);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Could not create a secure invoice link.");
  }

  return data.signedUrl;
}

/** Return a signed link suitable for an email; it expires after seven days. */
export function createInvoiceEmailUrl(reference) {
  return createInvoiceDownloadUrl(reference, EMAIL_URL_TTL_SECONDS);
}

/** Download an invoice through Storage RLS without exposing a public URL. */
export async function downloadInvoicePdf(reference) {
  const client = requireSupabase();
  const filePath = await resolveOwnedPath(reference);
  const { data, error } = await client.storage.from(INVOICE_BUCKET).download(filePath);

  if (error || !data) {
    throw new Error(error?.message || "Could not retrieve the invoice PDF.");
  }

  return data;
}

/** Best-effort removal used when the associated business record is deleted. */
export async function removeInvoicePdf(reference) {
  if (!reference) return;

  const client = requireSupabase();
  const filePath = await resolveOwnedPath(reference);
  const { error } = await client.storage.from(INVOICE_BUCKET).remove([filePath]);

  if (error) {
    throw new Error(error.message);
  }
}
