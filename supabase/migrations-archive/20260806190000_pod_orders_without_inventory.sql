-- POD: an order is based on a published design, not on pre-existing inventory units.
-- Physical units and their QR codes are created only after successful payment, for print.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_email text;

-- Repair test orders created before the payment workflow also advanced the
-- fulfillment status. A paid order is now ready to enter the POD queue.
UPDATE public.orders
SET status = 'paid'
WHERE payment_status = 'paid'
  AND status = 'pending';

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
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _order_id uuid;
  _order_number text;
  _item jsonb;
  _design_id uuid;
  _qty int;
  _unit_price numeric(10,2);
  _price_grosze int;
  _total numeric(10,2) := 0;
  _nip_clean text;
  _expected_shipping numeric(10,2);
  _phone_clean text;
  _customer_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _customer_email = '' OR _customer_email !~ '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'customer_email_unavailable';
  END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'empty_cart';
  END IF;
  IF jsonb_array_length(_items) > 100 THEN RAISE EXCEPTION 'too_many_items'; END IF;
  IF _shipping_method IS NULL OR _shipping_method NOT IN ('inpost','courier') THEN
    RAISE EXCEPTION 'invalid_shipping_method';
  END IF;

  IF _shipping_method = 'inpost' THEN
    IF coalesce(length(trim(_pickup_point_name)), 0) = 0 THEN RAISE EXCEPTION 'pickup_point_required'; END IF;
    _shipping_name := NULL; _shipping_street := NULL; _shipping_postal_code := NULL; _shipping_city := NULL; _shipping_phone := NULL;
  ELSE
    IF coalesce(length(trim(_shipping_name)), 0) = 0 THEN RAISE EXCEPTION 'shipping_name_required'; END IF;
    IF coalesce(length(trim(_shipping_street)), 0) = 0 THEN RAISE EXCEPTION 'shipping_street_required'; END IF;
    IF coalesce(length(trim(_shipping_postal_code)), 0) = 0 THEN RAISE EXCEPTION 'shipping_postal_code_required'; END IF;
    IF _shipping_postal_code !~ '^[0-9]{2}-[0-9]{3}$' THEN RAISE EXCEPTION 'shipping_postal_code_invalid'; END IF;
    IF coalesce(length(trim(_shipping_city)), 0) = 0 THEN RAISE EXCEPTION 'shipping_city_required'; END IF;
    _phone_clean := regexp_replace(coalesce(_shipping_phone, ''), '[^0-9+]', '', 'g');
    IF length(_phone_clean) < 9 OR length(_phone_clean) > 15 THEN RAISE EXCEPTION 'shipping_phone_invalid'; END IF;
    _shipping_phone := _phone_clean;
    _pickup_point_name := NULL; _pickup_point_address := NULL; _pickup_point_city := NULL;
  END IF;

  IF _payment_method IS NULL OR _payment_method NOT IN ('online','cod') THEN RAISE EXCEPTION 'invalid_payment_method'; END IF;
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
    _qty := (_item->>'quantity')::int;
    IF _qty IS NULL OR _qty < 1 OR _qty > 1000 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
    SELECT price_grosze INTO _price_grosze
    FROM public.card_designs
    WHERE id = _design_id AND active = true AND price_grosze > 0;
    IF _price_grosze IS NULL THEN RAISE EXCEPTION 'invalid_design:%', _design_id; END IF;
    _unit_price := _price_grosze::numeric / 100.0;
    _total := _total + (_qty * _unit_price);
  END LOOP;

  _total := _total + _shipping_cost;
  INSERT INTO public.orders(
    user_id, total_amount, pickup_point_name, pickup_point_address, pickup_point_city, shipping_cost,
    invoice_requested, company_name, company_nip, company_address, payment_method, shipping_method,
    shipping_name, shipping_address, shipping_postal_code, shipping_city, shipping_country, shipping_phone,
    customer_email
  ) VALUES (
    _uid, _total, _pickup_point_name, _pickup_point_address, _pickup_point_city, _shipping_cost,
    _invoice_requested, _company_name, _nip_clean, _company_address, _payment_method, _shipping_method,
    _shipping_name, _shipping_street, _shipping_postal_code, _shipping_city,
    CASE WHEN _shipping_method = 'courier' THEN 'Polska' ELSE NULL END, _shipping_phone,
    _customer_email
  ) RETURNING id, order_number INTO _order_id, _order_number;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _design_id := (_item->>'card_design_id')::uuid;
    _qty := (_item->>'quantity')::int;
    SELECT price_grosze INTO _price_grosze FROM public.card_designs WHERE id = _design_id;
    _unit_price := _price_grosze::numeric / 100.0;
    INSERT INTO public.order_items(order_id, card_design_id, quantity, unit_price, total_price)
    VALUES (_order_id, _design_id, _qty, _unit_price, _qty * _unit_price);
  END LOOP;

  RETURN jsonb_build_object('id', _order_id, 'order_number', _order_number, 'total_amount', _total, 'payment_method', _payment_method, 'shipping_method', _shipping_method);
END;
$function$;
