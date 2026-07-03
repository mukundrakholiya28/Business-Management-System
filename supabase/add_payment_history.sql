-- ============================================================
-- Migration: Add payment_history column to bills
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_history JSONB DEFAULT '[]'::jsonb;
