-- ============================================================
-- Migration: Add Odometer/Kilometres Run (kms_run) to Bills
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

ALTER TABLE bills ADD COLUMN IF NOT EXISTS kms_run INTEGER;
