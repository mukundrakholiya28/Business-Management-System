-- ============================================================
-- Shree Royal Car — Business Management System
-- Supabase (PostgreSQL) Normalized Schema
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ──────────────────────────────────────────────────────────────
-- 1. CUSTOMERS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE customers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT        NOT NULL,
  phone_number  VARCHAR(15) NOT NULL,
  email         TEXT,
  address       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by phone number (most common search path)
CREATE INDEX idx_customers_phone ON customers (phone_number);

-- ──────────────────────────────────────────────────────────────
-- 2. VEHICLES
-- ──────────────────────────────────────────────────────────────
CREATE TABLE vehicles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id     UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  vehicle_number  VARCHAR(20) NOT NULL,
  make            TEXT,           -- e.g. "Maruti Suzuki"
  model           TEXT,           -- e.g. "Swift Dzire"
  year            SMALLINT,
  color           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by vehicle number (most common search path)
CREATE INDEX idx_vehicles_number  ON vehicles (vehicle_number);
CREATE INDEX idx_vehicles_customer ON vehicles (customer_id);
ALTER TABLE vehicles ADD CONSTRAINT uq_vehicles_vehicle_number UNIQUE (vehicle_number);

-- ──────────────────────────────────────────────────────────────
-- 3. BILLS / INVOICES
-- ──────────────────────────────────────────────────────────────
-- Status enum for type-safe bill states
CREATE TYPE bill_status AS ENUM ('draft', 'pending', 'partially_paid', 'paid', 'cancelled');

CREATE TABLE bills (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_number   SERIAL,
  customer_id   UUID          NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  vehicle_id    UUID          NOT NULL REFERENCES vehicles(id)  ON DELETE RESTRICT,
  kms_run       INTEGER,                                        -- Odometer reading at service
  subtotal      NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  status        bill_status   NOT NULL DEFAULT 'draft',
  payment_method TEXT,                                          -- 'cash' | 'online' | NULL
  paid_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bills_customer ON bills (customer_id);
CREATE INDEX idx_bills_vehicle  ON bills (vehicle_id);
CREATE INDEX idx_bills_status   ON bills (status);
CREATE INDEX idx_bills_created  ON bills (created_at DESC);
ALTER TABLE bills ADD CONSTRAINT uq_bills_bill_number UNIQUE (bill_number);

-- ──────────────────────────────────────────────────────────────
-- 4. BILL LINE ITEMS  (normalized — one row per service/part)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE bill_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id       UUID          NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  description   TEXT          NOT NULL,        -- e.g. "Engine Oil Change"
  quantity      NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price   NUMERIC(12,2) NOT NULL DEFAULT 0,  -- quantity × unit_price
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bill_items_bill ON bill_items (bill_id);

-- ──────────────────────────────────────────────────────────────
-- 5. WORKERS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE workers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT          NOT NULL,
  role        TEXT          NOT NULL,      -- e.g. "Mechanic", "Painter", "Electrician"
  phone       VARCHAR(15),
  base_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
  joined_at   DATE          NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- 6. SALARY RECORDS  (ledger of every payout)
-- ──────────────────────────────────────────────────────────────
CREATE TYPE salary_type AS ENUM ('salary', 'bonus', 'advance', 'deduction');

CREATE TABLE salary_records (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id   UUID          NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
  amount_paid NUMERIC(12,2) NOT NULL,
  salary_type salary_type   NOT NULL DEFAULT 'salary',
  month       SMALLINT,            -- 1-12
  year        SMALLINT,            -- e.g. 2026
  date_paid   DATE          NOT NULL DEFAULT CURRENT_DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_salary_worker ON salary_records (worker_id);
CREATE INDEX idx_salary_date   ON salary_records (date_paid DESC);

-- ──────────────────────────────────────────────────────────────
-- 7. HELPER: auto-update `updated_at` trigger
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_vehicles_updated BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_bills_updated BEFORE UPDATE ON bills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_workers_updated BEFORE UPDATE ON workers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ──────────────────────────────────────────────────────────────
-- 8. ROW LEVEL SECURITY (RLS) — placeholder policies
--    Enable when Supabase Auth is configured.
-- ──────────────────────────────────────────────────────────────
-- ALTER TABLE customers      ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE vehicles        ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE bills            ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE bill_items       ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE workers          ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE salary_records   ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────
-- MIGRATIONS (run these if you already have an existing database)
-- ──────────────────────────────────────────────────────────────

-- Add payment_method column to bills (if upgrading from older schema)
ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- ──────────────────────────────────────────────────────────────
-- 9. BUSINESS PROFILE  (single-row settings table)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_profile (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL DEFAULT 'Shree Royal Car',
  tagline         TEXT NOT NULL DEFAULT 'Automotive Repair & Car Wash',
  established     TEXT NOT NULL DEFAULT '2004',
  address         TEXT NOT NULL DEFAULT 'Ahmedabad, Gujarat',
  phone           TEXT NOT NULL DEFAULT '+91 98765 43210',
  email           TEXT NOT NULL DEFAULT 'billing@shreeroyalcar.in',
  gstin           TEXT NOT NULL DEFAULT '',
  payment_methods TEXT NOT NULL DEFAULT 'UPI / Bank Transfer / Cash',
  upi_id          TEXT NOT NULL DEFAULT '',
  bank_name       TEXT NOT NULL DEFAULT '',
  account_number  TEXT NOT NULL DEFAULT '',
  ifsc            TEXT NOT NULL DEFAULT '',
  invoice_notes   TEXT NOT NULL DEFAULT 'Payment due within 7 days of invoice date.',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_business_profile_updated BEFORE UPDATE ON business_profile
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed a default row (idempotent)
INSERT INTO business_profile (
  name, tagline, established, address, phone, email, gstin,
  payment_methods, upi_id, bank_name, account_number, ifsc, invoice_notes
) VALUES (
  'Shree Royal Car', 'Automotive Repair & Car Wash', '2004',
  'Ahmedabad, Gujarat', '+91 98765 43210', 'billing@shreeroyalcar.in', '',
  'UPI / Bank Transfer / Cash', '', '', '', '', 'Payment due within 7 days of invoice date.'
) ON CONFLICT DO NOTHING;

-- Add pdf_url column to bills table (stored generated invoice PDFs)
ALTER TABLE bills ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- Migration to support partial payments:
ALTER TYPE bill_status ADD VALUE IF NOT EXISTS 'partially_paid';
ALTER TABLE bills ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Migration to support odometer reading at service:
ALTER TABLE bills ADD COLUMN IF NOT EXISTS kms_run INTEGER;

-- Migration to preserve insertion order of invoice line items:
ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_bill_items_sort ON bill_items (bill_id, sort_order);

-- Allow created_at on bills to be overridden (backdating / custom date):
-- No schema change needed — created_at is already TIMESTAMPTZ without a constraint.
-- Supabase RLS must allow the column to be updated; run if you see permission errors:
-- ALTER TABLE bills DISABLE ROW LEVEL SECURITY;  -- then re-enable with correct policy
