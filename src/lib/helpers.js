// ─── Utility Helpers ───

/**
 * Format a number as Indian Rupee currency
 */
export function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a date string to readable format
 */
export function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Format a date string with time
 */
export function formatDateTime(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Get status badge styling
 */
export function getStatusStyle(status) {
  switch (status) {
    case "paid":
      return { bg: "rgba(109,181,160,0.15)", color: "#4a9e80" };
    case "pending":
      return { bg: "rgba(224,180,116,0.15)", color: "#c49340" };
    case "partially_paid":
      return { bg: "rgba(59,130,246,0.15)", color: "#3b82f6" };
    case "draft":
      return { bg: "rgba(116,168,224,0.15)", color: "#5a8cc0" };
    case "cancelled":
      return { bg: "rgba(224,116,116,0.15)", color: "#c05a5a" };
    default:
      return { bg: "rgba(160,168,180,0.15)", color: "#6b7280" };
  }
}

/**
 * Get salary type badge styling
 */
export function getSalaryTypeStyle(type) {
  switch (type) {
    case "salary":
      return { bg: "rgba(109,181,160,0.15)", color: "#4a9e80" };
    case "bonus":
      return { bg: "rgba(116,168,224,0.15)", color: "#5a8cc0" };
    case "advance":
      return { bg: "rgba(224,180,116,0.15)", color: "#c49340" };
    case "deduction":
      return { bg: "rgba(224,116,116,0.15)", color: "#c05a5a" };
    default:
      return { bg: "rgba(160,168,180,0.15)", color: "#6b7280" };
  }
}

/**
 * Generate a unique ID (for demo mode)
 */
export function generateId() {
  return "id-" + Math.random().toString(36).substring(2, 11);
}

/**
 * Get initials from name
 */
export function getInitials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Normalize a string for semantic search:
 * lowercase, strip hyphens, spaces, and special chars
 */
export function normalizeSearch(str) {
  if (!str) return "";
  return str.toLowerCase().replace(/[-\s]/g, "");
}

/**
 * Strip hyphens from a vehicle number for display
 */
export function formatVehicleNumber(num) {
  if (!num) return "";
  return num.replace(/-/g, "");
}

/**
 * Format phone number for display — strips leading country code (91)
 * so stored "919876543210" shows as "9876543210"
 */
export function formatPhoneNumber(phone) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) {
    return digits.slice(2);
  }
  return digits || phone;
}

/**
 * Month names
 */
export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Clean phone numbers and prepend country code 91 if length is 10 digits
 */
export function normalizePhoneNumber(phone) {
  if (!phone) return "";
  const cleanPhone = phone.replace(/\D/g, "");
  if (cleanPhone.length === 10) {
    return "91" + cleanPhone;
  }
  return cleanPhone;
}
