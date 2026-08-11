-- A traveler may add one optional, country-specific language on the front.
-- The chosen language snapshot belongs to the order item, so later edits to
-- a dictionary entry cannot change an already paid order.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS secondary_language_code text,
  ADD COLUMN IF NOT EXISTS secondary_language_name text,
  ADD COLUMN IF NOT EXISTS secondary_front_thank_you_text text;

CREATE OR REPLACE FUNCTION public.create_order(
  _items jsonb,
  _pickup_point_name text,
  _pickup_point_address text,
  _pickup_point_city text,
  _shipping_cost numeric,
  _invoice_requested boolean DEFAULT false,
  _company_name text DEFAULT NULL,
  _company_nip text DEFAULT NULL,
  _company_address text DEFAULT NULL,
  _payment_method text DEFAULT 'online',
  _shipping_method text DEFAULT 'inpost',
  _shipping_name text DEFAULT NULL,
  _shipping_street text DEFAULT NULL,
  _shipping_postal_code text DEFAULT NULL,
  _shipping_city text DEFAULT NULL,
  _shipping_phone text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _order_id uuid;
  _order_number text;
  _item jsonb;
  _design_id uuid;
  _qty integer;
  _unit_price numeric(10,2);
  _price_grosze integer;
  _total numeric(10,2) := 0;
  _nip_clean text;
  _expected_shipping numeric(10,2);
  _phone_clean text;
  _customer_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  _secondary_language_code text;
  _secondary_language_name text;
  _secondary_front_thank_you_text text;
  _primary_language_code text;
  _country_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _customer_email = '' OR _customer_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN RAISE EXCEPTION 'customer_email_unavailable'; END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'empty_cart'; END IF;
  IF jsonb_array_length(_items) > 100 THEN RAISE EXCEPTION 'too_many_items'; END IF;
  IF _shipping_method NOT IN ('inpost', 'courier') THEN RAISE EXCEPTION 'invalid_shipping_method'; END IF;

  IF _shipping_method = 'inpost' THEN
    IF coalesce(length(trim(_pickup_point_name)), 0) = 0 THEN RAISE EXCEPTION 'pickup_point_required'; END IF;
    _shipping_name := NULL; _shipping_street := NULL; _shipping_postal_code := NULL; _shipping_city := NULL; _shipping_phone := NULL;
  ELSE
    IF coalesce(length(trim(_shipping_name)), 0) = 0 THEN RAISE EXCEPTION 'shipping_name_required'; END IF;
    IF coalesce(length(trim(_shipping_street)), 0) = 0 THEN RAISE EXCEPTION 'shipping_street_required'; END IF;
    IF coalesce(length(trim(_shipping_postal_code)), 0) = 0 OR _shipping_postal_code !~ '^[0-9]{2}-[0-9]{3}$' THEN RAISE EXCEPTION 'shipping_postal_code_invalid'; END IF;
    IF coalesce(length(trim(_shipping_city)), 0) = 0 THEN RAISE EXCEPTION 'shipping_city_required'; END IF;
    _phone_clean := regexp_replace(coalesce(_shipping_phone, ''), '[^0-9+]', '', 'g');
    IF length(_phone_clean) < 9 OR length(_phone_clean) > 15 THEN RAISE EXCEPTION 'shipping_phone_invalid'; END IF;
    _shipping_phone := _phone_clean; _pickup_point_name := NULL; _pickup_point_address := NULL; _pickup_point_city := NULL;
  END IF;

  IF _payment_method NOT IN ('online', 'cod') THEN RAISE EXCEPTION 'invalid_payment_method'; END IF;
  _expected_shipping := CASE WHEN _payment_method = 'online' THEN 13.99 ELSE 16.99 END;
  IF _shipping_cost IS NULL OR _shipping_cost <> _expected_shipping THEN RAISE EXCEPTION 'invalid_shipping_cost'; END IF;

  IF _invoice_requested THEN
    IF coalesce(length(trim(_company_name)), 0) = 0 THEN RAISE EXCEPTION 'invoice_company_name_required'; END IF;
    IF coalesce(length(trim(_company_address)), 0) = 0 THEN RAISE EXCEPTION 'invoice_company_address_required'; END IF;
    _nip_clean := regexp_replace(coalesce(_company_nip, ''), '[^0-9]', '', 'g');
    IF NOT public.is_valid_nip(_nip_clean) THEN RAISE EXCEPTION 'invoice_nip_invalid'; END IF;
  ELSE
    _company_name := NULL; _company_nip := NULL; _company_address := NULL; _nip_clean := NULL;
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _design_id := (_item->>'card_design_id')::uuid;
    _qty := (_item->>'quantity')::integer;
    IF _qty IS NULL OR _qty < 1 OR _qty > 1000 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;

    SELECT price_grosze, language_code, country_id
    INTO _price_grosze, _primary_language_code, _country_id
    FROM public.card_designs
    WHERE id = _design_id AND active = true AND price_grosze > 0;
    IF _price_grosze IS NULL THEN RAISE EXCEPTION 'invalid_design:%', _design_id; END IF;

    _secondary_language_code := nullif(trim(_item->>'secondary_language_code'), '');
    IF _secondary_language_code IS NOT NULL THEN
      IF _secondary_language_code = _primary_language_code THEN RAISE EXCEPTION 'secondary_language_must_differ'; END IF;
      SELECT language_name, front_thank_you_text
      INTO _secondary_language_name, _secondary_front_thank_you_text
      FROM public.card_language_templates
      WHERE country_id = _country_id AND language_code = _secondary_language_code;
      IF _secondary_front_thank_you_text IS NULL THEN RAISE EXCEPTION 'invalid_secondary_language'; END IF;
    END IF;

    _unit_price := _price_grosze::numeric / 100.0;
    _total := _total + (_qty * _unit_price);
  END LOOP;

  _total := _total + _shipping_cost;
  INSERT INTO public.orders(
    user_id, total_amount, pickup_point_name, pickup_point_address, pickup_point_city,
    shipping_cost, invoice_requested, company_name, company_nip, company_address,
    payment_method, shipping_method, shipping_name, shipping_address, shipping_postal_code,
    shipping_city, shipping_country, shipping_phone, customer_email
  ) VALUES (
    _uid, _total, _pickup_point_name, _pickup_point_address, _pickup_point_city,
    _shipping_cost, _invoice_requested, _company_name, _nip_clean, _company_address,
    _payment_method, _shipping_method, _shipping_name, _shipping_street, _shipping_postal_code,
    _shipping_city, CASE WHEN _shipping_method = 'courier' THEN 'Polska' ELSE NULL END,
    _shipping_phone, _customer_email
  ) RETURNING id, order_number INTO _order_id, _order_number;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _design_id := (_item->>'card_design_id')::uuid;
    _qty := (_item->>'quantity')::integer;
    SELECT price_grosze, language_code, country_id
    INTO _price_grosze, _primary_language_code, _country_id
    FROM public.card_designs WHERE id = _design_id;

    _secondary_language_code := nullif(trim(_item->>'secondary_language_code'), '');
    _secondary_language_name := NULL;
    _secondary_front_thank_you_text := NULL;
    IF _secondary_language_code IS NOT NULL THEN
      SELECT language_name, front_thank_you_text
      INTO _secondary_language_name, _secondary_front_thank_you_text
      FROM public.card_language_templates
      WHERE country_id = _country_id AND language_code = _secondary_language_code;
    END IF;

    _unit_price := _price_grosze::numeric / 100.0;
    INSERT INTO public.order_items(
      order_id, card_design_id, quantity, unit_price, total_price,
      secondary_language_code, secondary_language_name, secondary_front_thank_you_text
    ) VALUES (
      _order_id, _design_id, _qty, _unit_price, _qty * _unit_price,
      _secondary_language_code, _secondary_language_name, _secondary_front_thank_you_text
    );
  END LOOP;

  RETURN jsonb_build_object('id', _order_id, 'order_number', _order_number, 'total_amount', _total, 'payment_method', _payment_method, 'shipping_method', _shipping_method);
END;
$$;
