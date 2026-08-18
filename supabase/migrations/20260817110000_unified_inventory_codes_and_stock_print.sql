-- One product has one stable product_code regardless of fulfilment channel.
-- Every physical copy receives a globally unique serial suffix derived from
-- that product code. STOCK and POD therefore use the same identifier format.

CREATE SEQUENCE IF NOT EXISTS public.inventory_unit_serial_seq START WITH 1;

ALTER TABLE public.inventory_units
  ADD COLUMN IF NOT EXISTS inventory_serial_no bigint;

UPDATE public.inventory_units
SET inventory_serial_no = nextval('public.inventory_unit_serial_seq')
WHERE inventory_serial_no IS NULL;

ALTER TABLE public.inventory_units
  ALTER COLUMN inventory_serial_no SET DEFAULT nextval('public.inventory_unit_serial_seq'),
  ALTER COLUMN inventory_serial_no SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_units_serial_no_key
  ON public.inventory_units (inventory_serial_no);

CREATE OR REPLACE FUNCTION public.assign_inventory_unit_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _product_code text;
BEGIN
  IF NEW.inventory_serial_no IS NULL THEN
    NEW.inventory_serial_no := nextval('public.inventory_unit_serial_seq');
  END IF;

  SELECT product_code INTO _product_code
  FROM public.card_designs
  WHERE id = NEW.card_design_id;

  IF _product_code IS NULL OR btrim(_product_code) = '' THEN
    RAISE EXCEPTION 'card_design_product_code_missing';
  END IF;

  NEW.internal_inventory_code := _product_code || '-' || lpad(NEW.inventory_serial_no::text, 8, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_units_assign_unified_code ON public.inventory_units;
CREATE TRIGGER inventory_units_assign_unified_code
BEFORE INSERT ON public.inventory_units
FOR EACH ROW EXECUTE FUNCTION public.assign_inventory_unit_code();

UPDATE public.inventory_units iu
SET internal_inventory_code = cd.product_code || '-' || lpad(iu.inventory_serial_no::text, 8, '0')
FROM public.card_designs cd
WHERE cd.id = iu.card_design_id
  AND iu.internal_inventory_code IS DISTINCT FROM cd.product_code || '-' || lpad(iu.inventory_serial_no::text, 8, '0');

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

  _resolved_name := COALESCE(NULLIF(btrim(_batch_name), ''), 'Magazyn ' || to_char(now(), 'YYYY-MM-DD HH24:MI'));

  INSERT INTO public.stock_batches (
    name, description, card_design_id, quantity, source_type, purpose,
    distribution_channel, location_id, production_status
  ) VALUES (
    _resolved_name,
    'Partia magazynowa przygotowana do druku z indywidualnymi kodami QR.',
    _card_design_id,
    _quantity,
    'stock',
    'Stan magazynowy',
    'warehouse',
    _location_id,
    'ordered'
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
      stock_batch_id,
      card_design_id,
      internal_inventory_code,
      business_status,
      fulfillment_status,
      current_location_id,
      public_claim_code,
      public_claim_token_hash,
      qr_generated_at
    ) VALUES (
      _batch_id,
      _card_design_id,
      '',
      NULL,
      'qr_generated',
      _location_id,
      _claim_code,
      _token,
      now()
    ) RETURNING id INTO _unit_id;

    INSERT INTO public.qr_print_job_items (
      print_job_id, inventory_unit_id, public_claim_code, qr_url
    ) VALUES (
      _job_id,
      _unit_id,
      _claim_code,
      '/r/' || _token
    );
  END LOOP;

  UPDATE public.qr_print_jobs
  SET status = 'ready', generated_items = _quantity
  WHERE id = _job_id;

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', _batch_id,
    'print_job_id', _job_id,
    'quantity', _quantity,
    'document_number', 'MAG-' || upper(substr(replace(_batch_id::text, '-', ''), 1, 8))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_stock_print_batch(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_stock_print_batch(uuid, integer, text) TO authenticated;

COMMENT ON COLUMN public.inventory_units.inventory_serial_no IS
  'Global physical-copy serial used with card_designs.product_code for a channel-independent inventory code.';
COMMENT ON FUNCTION public.prepare_stock_print_batch(uuid, integer, text) IS
  'Creates a STOCK batch, physical units, claim codes, QR tokens and a ready print job for the SRA3 renderer.';
