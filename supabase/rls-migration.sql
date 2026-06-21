-- ============================================================
-- RLS MIGRATION — Per-user data isolation
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- ── 1. Add user_id to every data table ───────────────────────

ALTER TABLE customers       ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE vehicles         ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE bills             ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE bill_items        ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE business_profile  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- ── 2. Back-fill existing rows (assign to the first user, or leave NULL for now)
-- If you have existing rows you want to keep, run:
--   UPDATE customers      SET user_id = auth.uid() WHERE user_id IS NULL;
-- But since auth.uid() only works in RLS context, do it from the app after login,
-- or run manually with a specific user UUID:
--   UPDATE customers SET user_id = '<your-user-uuid>' WHERE user_id IS NULL;

-- ── 3. Enable RLS on all tables ──────────────────────────────

ALTER TABLE customers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills             ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_profile  ENABLE ROW LEVEL SECURITY;

-- ── 4. Drop any existing policies (clean slate) ──────────────

DROP POLICY IF EXISTS customers_policy        ON customers;
DROP POLICY IF EXISTS vehicles_policy         ON vehicles;
DROP POLICY IF EXISTS bills_policy            ON bills;
DROP POLICY IF EXISTS bill_items_policy       ON bill_items;
DROP POLICY IF EXISTS business_profile_policy ON business_profile;

-- ── 5. Create RLS policies ───────────────────────────────────
-- Each policy: authenticated users can only see/modify their own rows.
-- bill_items are joined through bills so we check the bill's user_id.

CREATE POLICY customers_policy ON customers
  FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY vehicles_policy ON vehicles
  FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY bills_policy ON bills
  FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- bill_items: user owns the item if they own the parent bill
CREATE POLICY bill_items_policy ON bill_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM bills
      WHERE bills.id = bill_items.bill_id
        AND bills.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM bills
      WHERE bills.id = bill_items.bill_id
        AND bills.user_id = auth.uid()
    )
  );

CREATE POLICY business_profile_policy ON business_profile
  FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 6. Indexes on user_id for query performance ──────────────

CREATE INDEX IF NOT EXISTS idx_customers_user      ON customers       (user_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_user       ON vehicles         (user_id);
CREATE INDEX IF NOT EXISTS idx_bills_user          ON bills             (user_id);
CREATE INDEX IF NOT EXISTS idx_business_profile_user ON business_profile (user_id);

-- ── Done ─────────────────────────────────────────────────────
-- After running this migration:
--   1. Deploy the updated workshop-data.js (which now passes user_id on insert)
--   2. The Supabase anon key + RLS handles all filtering automatically
--   3. No server-side secret key needed — RLS enforces isolation at DB level

-- ── 7. Storage Bucket & Policies for Invoices ────────────────
-- Run this to create the 'invoices' bucket and configure RLS policies for uploads

-- Create the bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete their own invoices" ON storage.objects;

-- Policy to allow authenticated users to upload to their own folder inside 'invoices'
-- The folder structure is: invoices/<user_id>/INV-xxx.pdf
CREATE POLICY "Allow authenticated uploads" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'invoices' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy to allow anyone (public) to view the invoices via the public URL
CREATE POLICY "Allow public read access" ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'invoices');

-- Policy to allow authenticated users to delete their own invoices
CREATE POLICY "Allow users to delete their own invoices" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'invoices' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy to allow authenticated users to update/overwrite their own invoices (required for upsert)
CREATE POLICY "Allow authenticated updates" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'invoices' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'invoices' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 8. Add pdf_url to bills table ────────────────────────────
ALTER TABLE bills ADD COLUMN IF NOT EXISTS pdf_url TEXT;
