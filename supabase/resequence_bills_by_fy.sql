-- ============================================================
-- Re-sequence ALL bills by Financial Year (Diwali to Diwali)
-- ============================================================
-- Run this in: Supabase Dashboard → SQL Editor
-- Run the whole file at once — steps must execute in order.
-- ============================================================

-- Step 1: Ensure the financial_year column exists
ALTER TABLE bills ADD COLUMN IF NOT EXISTS financial_year TEXT;

-- Step 2: Drop ALL old unique constraints on bill_number FIRST
--         (old constraint blocks assigning bill_number=1 to multiple FYs)
ALTER TABLE bills DROP CONSTRAINT IF EXISTS uq_bills_bill_number;
ALTER TABLE bills DROP CONSTRAINT IF EXISTS uq_bills_fy_bill_number;

-- Step 3: Force-recalculate financial_year for EVERY bill from its created_at
--         No WHERE clause — fixes any rows with wrong or missing financial_year
UPDATE bills
SET financial_year = CASE
  WHEN created_at <  '2021-11-05'                                    THEN '2020-2021'
  WHEN created_at >= '2021-11-05' AND created_at < '2022-10-25'      THEN '2021-2022'
  WHEN created_at >= '2022-10-25' AND created_at < '2023-11-13'      THEN '2022-2023'
  WHEN created_at >= '2023-11-13' AND created_at < '2024-11-01'      THEN '2023-2024'
  WHEN created_at >= '2024-11-01' AND created_at < '2025-10-21'      THEN '2024-2025'
  WHEN created_at >= '2025-10-21' AND created_at < '2026-11-09'      THEN '2025-2026'
  WHEN created_at >= '2026-11-09' AND created_at < '2027-10-30'      THEN '2026-2027'
  ELSE                                                                     '2027-2028'
END;

-- Step 4: Re-sequence bill_number from 1 per (user_id, financial_year)
--         ordered by created_at — oldest bill in each FY gets number 1
WITH resequenced AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, financial_year
      ORDER BY created_at ASC, id ASC
    ) AS new_number
  FROM bills
)
UPDATE bills
SET
  bill_number = resequenced.new_number,
  updated_at  = NOW()
FROM resequenced
WHERE bills.id = resequenced.id;

-- Step 5: Add FY-scoped unique constraint
--         New bills: number is scoped per (user_id + financial_year), restarts each FY
ALTER TABLE bills ADD CONSTRAINT uq_bills_fy_bill_number
  UNIQUE (user_id, financial_year, bill_number);

-- Step 6: Index for fast per-FY MAX() lookup when inserting new bills
CREATE INDEX IF NOT EXISTS idx_bills_fy ON bills (user_id, financial_year);

-- ── Verification — uncomment and run separately to confirm ───────────────────
-- SELECT
--   financial_year,
--   COUNT(*)         AS total_bills,
--   MIN(bill_number) AS first_num,
--   MAX(bill_number) AS last_num
-- FROM bills
-- GROUP BY financial_year
-- ORDER BY financial_year;
