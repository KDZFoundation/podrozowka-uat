-- 1. Helper function for Polish NIP validation (checksum modulo 11)
CREATE OR REPLACE FUNCTION public.is_valid_nip(_nip text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  _clean text;
  _weights integer[] := ARRAY[6, 5, 7, 2, 3, 4, 5, 6, 7];
  _sum integer := 0;
  _checksum integer;
  _i integer;
BEGIN
  IF _nip IS NULL THEN
    RETURN false;
  END IF;

  -- Remove all non-digit characters
  _clean := regexp_replace(_nip, '[^0-9]', '', 'g');

  -- NIP must be exactly 10 digits
  IF length(_clean) <> 10 THEN
    RETURN false;
  END IF;

  -- Calculate weighted sum for first 9 digits
  FOR _i IN 1..9 LOOP
    _sum := _sum + (substring(_clean from _i for 1)::integer * _weights[_i]);
  END LOOP;

  _checksum := _sum % 11;

  -- Modulo 11 must not equal 10, and must match the 10th digit
  IF _checksum = 10 THEN
    RETURN false;
  END IF;

  RETURN _checksum = substring(_clean from 10 for 1)::integer;
END;
$function$;

-- 2. Add missing columns to orders table
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pickup_point_name text,
  ADD COLUMN IF NOT EXISTS pickup_point_address text,
  ADD COLUMN IF NOT EXISTS pickup_point_city text,
  ADD COLUMN IF NOT EXISTS shipping_cost numeric(10,2),
  ADD COLUMN IF NOT EXISTS invoice_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS company_nip text,
  ADD COLUMN IF NOT EXISTS company_address text,
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'online' CHECK (payment_method IN ('online','cod')),
  ADD COLUMN IF NOT EXISTS shipping_method text NOT NULL DEFAULT 'inpost' CHECK (shipping_method IN ('inpost','courier')),
  ADD COLUMN IF NOT EXISTS shipping_phone text;

-- 3. Drop obsolete function signatures
DROP FUNCTION IF EXISTS public.create_order(jsonb, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.create_order(jsonb, text, text, text, numeric, boolean, text, text, text, text, text, text, text, text, text, text);

-- 4. Create 16-parameter create_order RPC function
CREATE OR REPLACE FUNCTION public.create_order(
  _items jsonb,
  _pickup_point_name text,
  _pickup_point_address text,
  _pickup_point_city text,
  _shipping_cost numeric,
  _invoice_requested boolean DEFAULT false,
  _company_name text DEFAULT NULL::text,
  _company_nip text DEFAULT NULL::text,
  _company_address text DEFAULT NULL::text,
  _payment_method text DEFAULT 'online',
  _shipping_method text DEFAULT 'inpost',
  _shipping_name text DEFAULT NULL::text,
  _shipping_street text DEFAULT NULL::text,
  _shipping_postal_code text DEFAULT NULL::text,
  _shipping_city text DEFAULT NULL::text,
  _shipping_phone text DEFAULT NULL::text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _uid uuid := auth.uid();
  _order_id uuid;
  _order_number text;
  _item jsonb;
  _design_id uuid;
  _qty int;
  _unit_price numeric(10,2);
  _price_grosze int;
  _available int;
  _total numeric(10,2) := 0;
  _nip_clean text;
  _expected_shipping numeric(10,2);
  _phone_clean text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'empty_cart';
  END IF;

  IF jsonb_array_length(_items) > 100 THEN
    RAISE EXCEPTION 'too_many_items';
  END IF;

  IF _shipping_method IS NULL OR _shipping_method NOT IN ('inpost','courier') THEN
    RAISE EXCEPTION 'invalid_shipping_method';
  END IF;

  IF _shipping_method = 'inpost' THEN
    IF coalesce(length(trim(_pickup_point_name)), 0) = 0 THEN
      RAISE EXCEPTION 'pickup_point_required';
    END IF;
    -- Wipe any courier fields
    _shipping_name := NULL;
    _shipping_street := NULL;
    _shipping_postal_code := NULL;
    _shipping_city := NULL;
    _shipping_phone := NULL;
  ELSE
    -- courier
    IF coalesce(length(trim(_shipping_name)), 0) = 0 THEN RAISE EXCEPTION 'shipping_name_required'; END IF;
    IF coalesce(length(trim(_shipping_street)), 0) = 0 THEN RAISE EXCEPTION 'shipping_street_required'; END IF;
    IF coalesce(length(trim(_shipping_postal_code)), 0) = 0 THEN RAISE EXCEPTION 'shipping_postal_code_required'; END IF;
    IF _shipping_postal_code !~ '^[0-9]{2}-[0-9]{3}$' THEN RAISE EXCEPTION 'shipping_postal_code_invalid'; END IF;
    IF coalesce(length(trim(_shipping_city)), 0) = 0 THEN RAISE EXCEPTION 'shipping_city_required'; END IF;
    _phone_clean := regexp_replace(coalesce(_shipping_phone, ''), '[^0-9+]', '', 'g');
    IF length(_phone_clean) < 9 OR length(_phone_clean) > 15 THEN RAISE EXCEPTION 'shipping_phone_invalid'; END IF;
    IF length(_shipping_name) > 200 THEN RAISE EXCEPTION 'shipping_name_too_long'; END IF;
    IF length(_shipping_street) > 300 THEN RAISE EXCEPTION 'shipping_street_too_long'; END IF;
    IF length(_shipping_city) > 100 THEN RAISE EXCEPTION 'shipping_city_too_long'; END IF;
    _shipping_phone := _phone_clean;
    -- Wipe pickup fields
    _pickup_point_name := NULL;
    _pickup_point_address := NULL;
    _pickup_point_city := NULL;
  END IF;

  IF _shipping_cost IS NULL OR _shipping_cost < 0 THEN
    RAISE EXCEPTION 'invalid_shipping_cost';
  END IF;

  IF _payment_method IS NULL OR _payment_method NOT IN ('online','cod') THEN
    RAISE EXCEPTION 'invalid_payment_method';
  END IF;

  IF _payment_method = 'online' THEN
    _expected_shipping := 13.99;
  ELSE
    _expected_shipping := 16.99;
  END IF;

  IF _shipping_cost <> _expected_shipping THEN
    RAISE EXCEPTION 'invalid_shipping_cost';
  END IF;

  IF _invoice_requested THEN
    IF coalesce(length(trim(_company_name)), 0) = 0 THEN RAISE EXCEPTION 'invoice_company_name_required'; END IF;
    IF coalesce(length(trim(_company_address)), 0) = 0 THEN RAISE EXCEPTION 'invoice_company_address_required'; END IF;
    _nip_clean := regexp_replace(coalesce(_company_nip, ''), '[^0-9]', '', 'g');
    IF NOT public.is_valid_nip(_nip_clean) THEN RAISE EXCEPTION 'invoice_nip_invalid'; END IF;
    IF length(_company_name) > 200 THEN RAISE EXCEPTION 'invoice_company_name_too_long'; END IF;
    IF length(_company_address) > 500 THEN RAISE EXCEPTION 'invoice_company_address_too_long'; END IF;
  ELSE
    _company_name := NULL;
    _company_nip := NULL;
    _company_address := NULL;
    _nip_clean := NULL;
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _design_id := (_item->>'card_design_id')::uuid;
    _qty := (_item->>'quantity')::int;

    IF _qty IS NULL OR _qty < 1 OR _qty > 1000 THEN
      RAISE EXCEPTION 'invalid_quantity';
    END IF;

    SELECT price_grosze INTO _price_grosze
    FROM public.card_designs
    WHERE id = _design_id AND active = true AND price_grosze > 0;

    IF _price_grosze IS NULL THEN
      RAISE EXCEPTION 'invalid_design:%', _design_id;
    END IF;

    SELECT COUNT(*)::int INTO _available
    FROM public.inventory_units iu
    WHERE iu.card_design_id = _design_id
      AND iu.fulfillment_status = 'in_stock'
      AND iu.order_id IS NULL;

    IF _qty > _available THEN
      RAISE EXCEPTION 'out_of_stock:%:%:%', _design_id, _qty, _available;
    END IF;

    _unit_price := _price_grosze::numeric / 100.0;
    _total := _total + (_qty * _unit_price);
  END LOOP;

  _total := _total + _shipping_cost;

  INSERT INTO public.orders(
    user_id, total_amount,
    pickup_point_name, pickup_point_address, pickup_point_city, shipping_cost,
    invoice_requested, company_name, company_nip, company_address,
    payment_method,
    shipping_method,
    shipping_name, shipping_address, shipping_postal_code, shipping_city, shipping_country, shipping_phone
  ) VALUES (
    _uid, _total,
    _pickup_point_name, _pickup_point_address, _pickup_point_city, _shipping_cost,
    _invoice_requested, _company_name, _nip_clean, _company_address,
    _payment_method,
    _shipping_method,
    _shipping_name, _shipping_street, _shipping_postal_code, _shipping_city,
    CASE WHEN _shipping_method = 'courier' THEN 'Polska' ELSE NULL END,
    _shipping_phone
  )
  RETURNING id, order_number INTO _order_id, _order_number;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _design_id := (_item->>'card_design_id')::uuid;
    _qty := (_item->>'quantity')::int;

    SELECT price_grosze INTO _price_grosze FROM public.card_designs WHERE id = _design_id;
    _unit_price := _price_grosze::numeric / 100.0;

    INSERT INTO public.order_items(order_id, card_design_id, quantity, unit_price, total_price)
    VALUES (_order_id, _design_id, _qty, _unit_price, _qty * _unit_price);
  END LOOP;

  RETURN jsonb_build_object(
    'id', _order_id,
    'order_number', _order_number,
    'total_amount', _total,
    'payment_method', _payment_method,
    'shipping_method', _shipping_method
  );
END;
$function$;

-- 5. Permissions
REVOKE EXECUTE ON FUNCTION public.create_order(jsonb, text, text, text, numeric, boolean, text, text, text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(jsonb, text, text, text, numeric, boolean, text, text, text, text, text, text, text, text, text, text) TO authenticated;
