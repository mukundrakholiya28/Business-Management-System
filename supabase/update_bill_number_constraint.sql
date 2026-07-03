-- ============================================================
-- Migration: Fix Bill Number Unique Constraint & Sequences
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Drop the global unique constraint on bill_number if it exists
ALTER TABLE bills DROP CONSTRAINT IF EXISTS uq_bills_bill_number;

-- 2. Drop the default serial sequence from bill_number (so it behaves as a normal integer)
ALTER TABLE bills ALTER COLUMN bill_number DROP DEFAULT;

-- 3. Re-sequence ALL existing bills sequentially starting from 1 for each user.
-- This cleans up duplicates and missing numbers so the new constraint can be applied.
WITH sequenced_bills AS (
  SELECT 
    id, 
    row_number() OVER (PARTITION BY user_id ORDER BY created_at ASC) as new_number
  FROM bills
)
UPDATE bills
SET bill_number = sequenced_bills.new_number
FROM sequenced_bills
WHERE bills.id = sequenced_bills.id;

-- 4. Add the per-user unique constraint on (user_id, bill_number)
ALTER TABLE bills ADD CONSTRAINT uq_bills_bill_number UNIQUE (user_id, bill_number);
