-- A STOCK order is not inventory until the printed cards are physically
-- received. QR units are prepared for the print shop first and move to
-- in_stock only after the administrator confirms receipt.

DO $$
DECLARE
  _batch record;
  _stock_order_id uuid;
  _has_physical_stock boolean;
BEGIN
  FOR _batch IN
    SELECT sb.*
    FROM public.stock_batches sb
    WHERE sb.source_type = 'stock'
      AND sb.production_order_id IS NULL
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.inventory_units iu
      WHERE iu.stock_batch_id = _batch.id
        AND iu.fulfillment_status = 'in_stock'
    ) INTO _has_physical_stock;

    INSERT INTO public.stock_production_orders (
      name, purpose, distribution_channel, location_id, status,
      total_quantity, ordered_at, received_at
    ) VALUES (
      _batch.name,
      COALESCE(_batch.purpose, 'Stan magazynowy'),
      COALESCE(_batch.distribution_channel, 'warehouse'),
      _batch.location_id,
      CASE WHEN _has_physical_stock THEN 'received' ELSE 'ordered' END,
      _batch.quantity,
      _batch.created_at,
      CASE WHEN _has_physical_stock THEN COALESCE(_batch.received_at, now()) ELSE NULL END
    ) RETURNING id INTO _stock_order_id;

    UPDATE public.stock_batches
    SET production_order_id = _stock_order_id,
        production_status = CASE WHEN _has_physical_stock THEN 'received' ELSE 'ordered' END,
        received_at = CASE WHEN _has_physical_stock THEN COALESCE(received_at, now()) ELSE NULL END
    WHERE id = _batch.id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_stock_print_batch(
  _card_design_id uuid,
  _quantity integer,
  _batch_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _stock_order_id uuid;
  _batch_id uuid;
  _job_id uuid;
  _location_id uuid;
  _unit_id uuid;
  _claim_code text;
  _token text;
  _copy_no integer;
  _resolved_name text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin_access_required';
  END IF;
  IF _quantity IS NULL OR _quantity < 1 OR _quantity > 10000 THEN
    RAISE EXCEPTION 'quantity_must_be_between_1_and_10000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.card_designs
    WHERE id = _card_design_id AND active = true
  ) THEN
    RAISE EXCEPTION 'active_card_design_not_found';
  END IF;

  SELECT id INTO _location_id
  FROM public.inventory_locations
  WHERE code = 'MAIN'
  LIMIT 1;

  _resolved_name := COALESCE(NULLIF(btrim(_batch_name), ''), 'Zamówienie magazynowe ' || to_char(now(), 'YYYY-MM-DD HH24:MI'));

  INSERT INTO public.stock_production_orders (
    name, purpose, distribution_channel, location_id, status,
    total_quantity, ordered_at, created_by
  ) VALUES (
    _resolved_name,
    'Stan magazynowy',
    'warehouse',
    _location_id,
    'ordered',
    _quantity,
    now(),
    auth.uid()
  ) RETURNING id INTO _stock_order_id;

  INSERT INTO public.stock_batches (
    name, description, card_design_id, quantity, source_type, purpose,
    distribution_channel, location_id, production_status, production_order_id
  ) VALUES (
    _resolved_name,
    'Wewnętrzne zamówienie magazynowe przygotowane do druku z indywidualnymi kodami QR.',
    _card_design_id,
    _quantity,
    'stock',
    'Stan magazynowy',
    'warehouse',
    _location_id,
    'ordered',
    _stock_order_id
  ) RETURNING id INTO _batch_id;

  INSERT INTO public.qr_print_jobs (
    name, status, total_items, generated_items, created_by
  ) VALUES (
    'MAG — ' || _resolved_name,
    'generating',
    _quantity,
    0,
    auth.uid()
  ) RETURNING id INTO _job_id;

  FOR _copy_no IN 1.._quantity LOOP
    _claim_code := public.generate_claim_code();
    _token := md5(random()::text || clock_timestamp()::text || _batch_id::text || _copy_no::text);

    INSERT INTO public.inventory_units (
      stock_batch_id, card_design_id, internal_inventory_code,
      business_status, fulfillment_status, current_location_id,
      public_claim_code, public_claim_token_hash, qr_generated_at
    ) VALUES (
      _batch_id, _card_design_id, '', NULL, 'qr_generated', NULL,
      _claim_code, _token, now()
    ) RETURNING id INTO _unit_id;

    INSERT INTO public.qr_print_job_items (
      print_job_id, inventory_unit_id, public_claim_code, qr_url
    ) VALUES (
      _job_id, _unit_id, _claim_code, '/r/' || _token
    );
  END LOOP;

  UPDATE public.qr_print_jobs
  SET status = 'ready', generated_items = _quantity
  WHERE id = _job_id;

  RETURN jsonb_build_object(
    'success', true,
    'stock_order_id', _stock_order_id,
    'batch_id', _batch_id,
    'print_job_id', _job_id,
    'quantity', _quantity,
    'document_number', 'MAG-' || upper(substr(replace(_batch_id::text, '-', ''), 1, 8))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_stock_production_order(_stock_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _order public.stock_production_orders%ROWTYPE;
  _received_count integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin_access_required';
  END IF;

  SELECT * INTO _order
  FROM public.stock_production_orders
  WHERE id = _stock_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stock_order_not_found';
  END IF;
  IF _order.status = 'received' THEN
    RETURN jsonb_build_object('success', true, 'already_received', true, 'received_units', 0);
  END IF;
  IF _order.status IN ('closed', 'cancelled') THEN
    RAISE EXCEPTION 'stock_order_not_receivable';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.inventory_units iu
    JOIN public.stock_batches sb ON sb.id = iu.stock_batch_id
    WHERE sb.production_order_id = _stock_order_id
      AND iu.public_claim_code IS NULL
  ) THEN
    RAISE EXCEPTION 'stock_order_qr_not_ready';
  END IF;

  UPDATE public.inventory_units iu
  SET fulfillment_status = 'in_stock',
      current_location_id = _order.location_id
  FROM public.stock_batches sb
  WHERE sb.id = iu.stock_batch_id
    AND sb.production_order_id = _stock_order_id
    AND iu.fulfillment_status IN ('qr_generated', 'qr_applied', 'reserved');
  GET DIAGNOSTICS _received_count = ROW_COUNT;

  UPDATE public.stock_batches
  SET production_status = 'received',
      received_at = now(),
      location_id = _order.location_id
  WHERE production_order_id = _stock_order_id;

  UPDATE public.stock_production_orders
  SET status = 'received',
      received_at = now()
  WHERE id = _stock_order_id;

  RETURN jsonb_build_object('success', true, 'received_units', _received_count);
END;
$$;

REVOKE ALL ON FUNCTION public.receive_stock_production_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receive_stock_production_order(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_inventory_status_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _movement_type text;
BEGIN
  IF OLD.current_location_id IS DISTINCT FROM NEW.current_location_id THEN
    _movement_type := 'transferred';
  ELSIF OLD.fulfillment_status IS DISTINCT FROM NEW.fulfillment_status THEN
    _movement_type := CASE NEW.fulfillment_status
      WHEN 'allocated' THEN 'allocated'
      WHEN 'issued' THEN 'issued'
      WHEN 'voided' THEN 'voided'
      WHEN 'damaged' THEN 'damaged'
      WHEN 'in_stock' THEN CASE
        WHEN OLD.fulfillment_status IN ('qr_generated', 'qr_applied', 'reserved') THEN 'received'
        ELSE 'returned'
      END
      ELSE NULL
    END;
  END IF;

  IF _movement_type IS NOT NULL THEN
    INSERT INTO public.inventory_movements (
      inventory_unit_id, stock_batch_id, movement_type,
      from_location_id, to_location_id, reference_type, reference_id,
      note, actor_id
    ) VALUES (
      NEW.id, NEW.stock_batch_id, _movement_type,
      OLD.current_location_id, NEW.current_location_id,
      CASE WHEN NEW.order_id IS NOT NULL THEN 'order' ELSE 'inventory' END,
      NEW.order_id,
      NEW.distribution_note,
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.receive_stock_production_order(uuid) IS
  'Confirms physical receipt from the print shop and only then introduces the printed QR units into stock.';
