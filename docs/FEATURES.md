# Shree Royal Car — Business Management System
## Working Features

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19 |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (JWT) |
| Styling | Tailwind CSS v3 with custom design tokens |
| Charts | Recharts (bar + donut) |
| PDF | html2canvas + jsPDF (client-side), EJS template (server-side) |
| Email | Nodemailer via SMTP (Resend-compatible) |
| WhatsApp | `wa.me` / `whatsapp://` deep link scheme |

---

## 1. Authentication

- Email + password sign-in via Supabase Auth
- JWT session persisted in localStorage and auto-restored on load
- `onAuthStateChange` subscription keeps session in sync across tabs
- All pages protected — unauthenticated users are redirected to `/login`
- API routes validate JWT from `Authorization: Bearer <token>` header

---

## 2. Dashboard (`/`)

- **Total Revenue** — all-time collected amount (paid + partial payments)
- **Pending Amount** — sum of unpaid + remaining on partial bills
- **Total Invoices** — count with month-over-month trend pill (↑↓ or same)
- **Recent Invoices** table — last 5 bills with customer, vehicle, date, status, amount
- Inline status change from the dashboard table
- Click any invoice row to jump to the full billing view
- Quick sidebar links to Customers, Finance, and vehicle count

---

## 3. Customer Management (`/customers`)

- Customer list with name, phone, email, and linked vehicle number badges
- **Stats cards** — total customer count and total vehicle count
- **Search** — filter by customer name, phone number, vehicle number, make, or model
- **Add Customer** — name, phone (optional), email (optional), address (optional), plus one or more vehicles at creation time
- Duplicate warning if a similar name already exists during creation
- Duplicate phone number blocked at database level
- **Edit Customer** — update name, phone, email, address inline
- **Delete Customer** — cascades to all linked vehicles and their invoices (with confirmation modal)
- Each customer row shows vehicle number pills (desktop) or a car count badge (mobile)

---

## 4. Customer Detail (`/customers/[id]`)

- **Profile card** — initials avatar, name, phone (clickable — call or copy), email, address, customer since date
- **Summary pills** — total invoice count, total paid, pending amount (shown only when non-zero)
- **Vehicles & Invoices** section — one card per vehicle, collapsible
- Per-vehicle stats — invoice count and total paid
- **Add Vehicle** — vehicle number (optional), make, model, year, color
- **Edit Vehicle** — update any field; duplicate vehicle number check
- **Delete Vehicle** — cascades to all invoices for that vehicle (with confirmation)
- **New Bill** button per vehicle — opens the invoice form pre-filled with that vehicle
- Per-vehicle invoice history table (desktop) / card list (mobile) with INV-number, date, status, amount
- Inline status change on each row
- Per-invoice actions: Edit, Download PDF, Send (email + WhatsApp), Delete

---

## 5. Billing (`/billing`)

### Invoice List
- Full invoice list sorted by bill number descending
- **Search** — by invoice number, customer name, or vehicle number
- **Time filter** — Today, This Month, This Year, Custom date range, All
- **Status filter** — All, Draft, Pending, Partially Paid, Paid, Cancelled
- Desktop table view; mobile card list view
- Inline status change on any row
- Per-row actions: Edit, Download PDF, Send, Delete

### Create / Edit Invoice
- **Customer** — searchable dropdown (by name or phone)
- **Vehicle** — searchable dropdown filtered to selected customer's vehicles
- **Add New Customer** inline (with vehicles) without leaving the form
- **Add Vehicle to Customer** inline without leaving the form
- **Invoice Date** — date picker, supports backdating
- **Odometer (km)** — optional reading at time of service
- **Line Items** — unlimited items with description (with autocomplete suggestions based on model + past services), quantity, unit price; live total per item
- Line item autocomplete suggestions: model-specific suggestions first, then all previously used service descriptions, then a base list of 15 common car services
- Numpad `+` shortcut adds a new line item
- Enter-key navigation flows through all fields (customer → vehicle → date → odometer → items → discount → payment → notes → save)
- **Payment History** — add one or more payment parts (date, amount, cash/online); auto-derives status (paid / partially paid / pending) from total paid vs total amount
- **Discount** — flat rupee discount field
- **GST toggle** — enable/disable; preset buttons for 5%, 12%, 18%, 28% plus a custom input
- **Notes** — optional free-text field
- **Save as Draft** option (new invoices only)
- **Status override** (edit mode only) — manually set to any status
- Status preview badge shown before saving on new invoices
- Live totals summary (subtotal, GST, discount, total, paid, remaining)
- Bill saves to DB immediately; PDF generates and uploads to storage in the background

### Invoice Detail Modal
- Customer and vehicle summary cards
- Line items table (desktop) / card list (mobile)
- Totals breakdown — subtotal, GST rate + amount, discount, total, amount paid, payment history timeline, remaining balance
- Status selector
- Payment method label
- "Awaiting online payment" notice with Resend WhatsApp Link button (when payment method is online and status is pending)
- Actions: Download PDF, Edit, Send

### Invoice Deletion
- Deletes bill and all its line items
- Re-sequences all subsequent bill numbers down by 1 to keep the sequence gapless

---

## 6. PDF Invoice Generation

- Server-side EJS template renders branded A4 HTML
  - Company logo (embedded as base64), name, tagline, established year
  - Invoice number (SRC-XXXX format), date, due date, status pill
  - "From" (business details, GSTIN if set) and "Bill To" (customer, vehicle, odometer)
  - Line items table (Description, Qty, Rate, Amount)
  - Totals: subtotal, discount, GST, total due / balance due for partial payments
  - Payment methods section (UPI ID, bank name, account, IFSC)
  - Invoice notes / terms
  - Footer with thank-you and business phone
  - **Multi-page support** — 10 items on page 1, 18 items per continuation page; continuation pages have a compact header
- Fonts (NotoSans, Poppins, Oswald) inlined as base64 to ensure correct rendering with no external requests
- Client renders HTML to PDF via html2canvas (2× scale) + jsPDF (A4 mm)
- Generated PDF automatically uploaded to Supabase Storage (`invoices/<user_id>/INV-<number>.pdf`)
- On subsequent downloads, the stored PDF is served directly via a 5-minute signed URL
- PDF regenerated and re-stored whenever an invoice is edited

---

## 7. Invoice Delivery

### Email
- Triggered by the "Send" button when the customer has an email address on file
- Server-side route loads invoice data through RLS — the browser cannot change the recipient
- Rate limited to 10 emails per 10 minutes per user
- PDF validated server-side (must be a real PDF, max 10 MB, must be from the user's own storage path)
- HTML email includes: greeting, invoice number, status badge, customer + vehicle summary, full line items table, totals breakdown, optional PDF download button
- PDF attached to the email
- Sent via Nodemailer over SMTP (compatible with Resend, SendGrid, or any SMTP provider)

### WhatsApp
- Opens WhatsApp Web (desktop) or native WhatsApp app (mobile) via `whatsapp://` deep link with a 1.5-second HTTPS fallback
- Pre-filled message includes: customer name, invoice number, total amount, and a 7-day signed PDF URL
- On mobile browsers / PWA, tries the Web Share API first (shares the PDF file natively) and falls back to WhatsApp URL

### Combined Send
- If customer has both email and phone, email is sent and WhatsApp is opened simultaneously
- Toast feedback reports which channels succeeded or failed

---

## 8. Finance Analytics (`/finance`)

- **Period filter** — Today, This Month, This Year, Custom range, All Time
- **5 KPI cards** — Collected revenue, Pending amount, Total Invoiced, Average invoice value, Collection rate % (with progress bar)
- **Revenue Trend bar chart** — collected (green) vs pending (yellow) bars over time; axis auto-adapts to period (daily → dates, monthly → months, yearly → years)
- **Invoice Status donut chart** — count distribution across Paid, Partially Paid, Pending, Cancelled
- **Top Customers horizontal bar chart** — top 8 customers by collected amount in the selected period
- **Grouped breakdown table** — invoices grouped by day/month/year with per-group totals; click any row to open that invoice in the billing view

---

## 9. Worker Ledger (`/workers`)

- **Stats** — active worker count, monthly payroll total, total salary ever disbursed
- **Staff Directory** — worker card with initials avatar (color-coded by role), name, role badge, phone, join date, base salary
- Roles: Head Mechanic, Mechanic, Electrician, Painter, Helper, AC Technician
- Active / Inactive badge
- **Pay button** per worker — opens payment modal
- **Payment modal** — type (Salary / Bonus / Advance / Deduction), amount, month, year, optional notes
- **Expandable salary history** per worker — each record shows type badge, date, month/year label, amount (deductions shown in red)
- **Add Worker** — name, role, phone, base salary

---

## 10. Business Profile (`/profile`)

Three tabbed sections:

**Company**
- Business name, tagline, established year
- Phone, email, address

**Payment & Bank**
- Accepted payment methods (free text, e.g. "UPI / Bank Transfer / Cash")
- UPI ID
- Bank name, account number, IFSC code

**Invoice**
- Invoice notes / payment terms (textarea)
- Live preview of how payment and notes sections will appear on the printed invoice

All fields are saved to `business_profile` in the database and automatically pulled into every generated PDF.

---

## 11. Global Search (Navbar)

- Desktop: always-visible search bar in the navbar
- Mobile: icon toggle opens a portal-mounted search bar below the navbar
- Searches customers by name and phone, vehicles by registration number
- Minimum 2 characters to trigger results
- Data loaded lazily on first focus (no initial page load cost)
- Results show customer name + phone + linked vehicles, or vehicle number + make/model + owner name
- Click navigates to `/customers/[id]`
- ESC key closes the dropdown

---

## 12. Walk-in Customer Support

- Invoices can be created without selecting a customer or vehicle
- System auto-creates a "Walk-in Customer" (phone: 910000000000) and a "WALK-IN" vehicle the first time this happens
- Subsequent walk-in bills reuse the same records

---

## 13. PhoneNumber Component

- Every phone number in the UI is an interactive element
- Click opens a small popover with "Call" (opens `tel:` link) and "Copy number" actions
- Copies the display number (without country code) to clipboard

---

## 14. API Health Check (`/api/health`)

- `GET /api/health` pings the `customers` table and returns `{ status, timestamp, latency }`
- Returns HTTP 503 if Supabase is unreachable
- Used for uptime monitoring / deployment checks

---

## 15. WhatsApp Webhook (`/api/whatsapp-webhook`)

- `GET` — handles Meta's verification handshake (hub.mode + verify token)
- `POST` — validates HMAC-SHA256 signature using `WHATSAPP_APP_SECRET`
- Processes incoming message events and status updates (sent / delivered / read / failed)
- Handlers are structured and ready for Supabase persistence (TODO stubs in place)

---

## 16. Security

- **Row Level Security (RLS)** — all tables scoped to `auth.uid()` at the database level; users can only read/write their own data
- **Storage RLS** — invoice PDFs stored under `invoices/<user_id>/`; users can only access files in their own folder
- **API auth** — all API routes verify the JWT from the request header; data is fetched through an RLS-scoped client so the server cannot be used to access other users' data
- **Email security** — invoice recipient is loaded server-side from the database; the browser payload only provides the bill ID
- **Rate limiting** — email endpoint enforces 10 requests per 10 minutes per user (in-memory)
- **Input sanitization** — `sanitizeObject()` escapes HTML in all string fields before DB writes
- **PDF validation** — attachment must pass `%PDF-` header check and size limit; signed URL must originate from the configured Supabase storage domain
- **Phone normalization** — phone numbers stored with country code 91 prefix; displayed without it

---

## 17. UX Details

- **Loading skeletons** for all 6 page variants (dashboard, billing, customers, customer-detail, profile, default) — no blank flash on navigation
- **Toast notifications** — bottom-right slide-in for all save/delete/send operations, auto-dismissed after 3 seconds
- **Confirmation modals** for all destructive actions (delete customer, delete vehicle, delete invoice)
- **Optimistic UI** — bill saves to DB first, UI updates immediately, PDF generation runs in the background
- **Responsive** — all pages have distinct desktop table and mobile card/list layouts
- **Keyboard navigation** — full Enter-key flow through all invoice form fields; Numpad `+` adds a line item; ESC closes search
- **Bill number sequence** — sequential integers per user, automatically re-sequenced when a bill is deleted
- **Batch data loading** — workshop data fetched in 1000-row pages to bypass Supabase's row limit
- **Paginated loaders available** — `loadBillsPaginated` and `loadCustomersPaginated` are implemented and ready for high-volume use
