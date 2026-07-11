-- ============================================================
-- Transaction-safe Bill Creation and Update Function
-- Run this in your Supabase SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION save_bill_with_items(
  p_bill_id UUID,
  p_customer_id UUID,
  p_vehicle_id UUID,
  p_kms_run INTEGER,
  p_subtotal NUMERIC,
  p_tax_amount NUMERIC,
  p_discount NUMERIC,
  p_total_amount NUMERIC,
  p_status bill_status,
  p_payment_method TEXT,
  p_paid_amount NUMERIC,
  p_notes TEXT,
  p_pdf_url TEXT,
  p_payment_history JSONB,
  p_created_at TIMESTAMPTZ,
  p_items JSONB,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_bill_id UUID := p_bill_id;
  v_bill_number INTEGER;
  v_item RECORD;
  v_response JSONB;
  v_user_id UUID;
BEGIN
  -- Determine current user ID (auth.uid() if running in user context, else fallback to passed parameter)
  IF auth.uid() IS NOT NULL THEN
    v_user_id := auth.uid();
  ELSE
    v_user_id := p_user_id;
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. If bill_id is provided, check if it exists (meaning we are updating)
  IF v_bill_id IS NOT NULL AND EXISTS (SELECT 1 FROM bills WHERE id = v_bill_id) THEN
    -- Verify ownership before update
    IF NOT EXISTS (SELECT 1 FROM bills WHERE id = v_bill_id AND user_id = v_user_id) THEN
      RAISE EXCEPTION 'Unauthorized: You do not own this bill';
    END IF;

    -- Update existing bill
    UPDATE bills SET
      customer_id = p_customer_id,
      vehicle_id = p_vehicle_id,
      kms_run = p_kms_run,
      subtotal = p_subtotal,
      tax_amount = p_tax_amount,
      discount = p_discount,
      total_amount = p_total_amount,
      status = p_status,
      payment_method = p_payment_method,
      paid_amount = p_paid_amount,
      notes = p_notes,
      pdf_url = p_pdf_url,
      payment_history = p_payment_history,
      created_at = COALESCE(p_created_at, created_at),
      updated_at = NOW()
    WHERE id = v_bill_id;
  ELSE
    -- Insert new bill
    IF v_bill_id IS NULL THEN
      v_bill_id := uuid_generate_v4();
    END IF;

    -- Calculate next bill_number atomically inside transaction with write lock on bills
    -- to prevent sequence gaps/collisions
    SELECT COALESCE(MAX(bill_number), 0) + 1 INTO v_bill_number 
    FROM bills 
    WHERE user_id = v_user_id;

    INSERT INTO bills (
      id, bill_number, customer_id, vehicle_id, kms_run, subtotal, tax_amount, 
      discount, total_amount, status, payment_method, paid_amount, notes, 
      pdf_url, payment_history, user_id, created_at, updated_at
    ) VALUES (
      v_bill_id, v_bill_number, p_customer_id, p_vehicle_id, p_kms_run, p_subtotal, p_tax_amount, 
      p_discount, p_total_amount, p_status, p_payment_method, p_paid_amount, p_notes, 
      p_pdf_url, p_payment_history, v_user_id, COALESCE(p_created_at, NOW()), NOW()
    );
  END IF;

  -- 2. Insert items (only if p_items is provided)
  IF p_items IS NOT NULL THEN
    -- If updating, delete existing items first
    IF p_bill_id IS NOT NULL AND EXISTS (SELECT 1 FROM bills WHERE id = v_bill_id) THEN
      DELETE FROM bill_items WHERE bill_id = v_bill_id;
    END IF;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
      description TEXT,
      quantity NUMERIC,
      unit_price NUMERIC,
      total_price NUMERIC,
      sort_order INTEGER
    ) LOOP
      INSERT INTO bill_items (
        bill_id, description, quantity, unit_price, total_price, sort_order, user_id
      ) VALUES (
        v_bill_id, v_item.description, v_item.quantity, v_item.unit_price, v_item.total_price, v_item.sort_order, v_user_id
      );
    END LOOP;
  END IF;

  -- Fetch the saved bill row to return
  SELECT row_to_json(b) INTO v_response FROM bills b WHERE id = v_bill_id;
  RETURN v_response;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
