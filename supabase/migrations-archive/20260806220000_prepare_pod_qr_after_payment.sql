-- POD fulfillment: every paid order receives a traceable physical unit and a
-- permanent QR code for each ordered postcard. These units are created only
-- after payment; they are not pre-existing shop stock.

CREATE OR REPLACE FUNCTION public.prepare_pod_order(_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order public.orders%ROWTYPE;
  _item record;
  _job_id uuid;
  _batch_id uuid;
  _unit_id uuid;
  _claim_code text;
  _token text;
  _item_no integer := 0;
  _copy_no integer;
BEGIN
  SELECT * INTO _order
  FROM public.orders
  WHERE id = _order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF _order.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'order_not_paid';
  END IF;

  -- Idempotency protects against duplicate payment callbacks.
  SELECT id INTO _job_id
  FROM public.qr_print_jobs
  WHERE order_id = _order_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF _job_id IS NOT NULL THEN
    RETURN _job_id;
  END IF;

  INSERT INTO public.qr_print_jobs (
    name, order_id, status, total_items, generated_items, created_by
  )
  VALUES (
    'POD — zamówienie ' || _order.order_number,
    _order_id,
    'generating',
    0,
    0,
    _order.user_id
  )
  RETURNING id INTO _job_id;

  FOR _item IN
    SELECT id, card_design_id, quantity
    FROM public.order_items
    WHERE order_id = _order_id
    ORDER BY created_at, id
  LOOP
    -- A batch records the print run for traceability; it is not store stock.
    INSERT INTO public.stock_batches (name, description, card_design_id, quantity)
    VALUES (
      'POD ' || _order.order_number,
      'Sztuki utworzone automatycznie po opłaceniu zamówienia.',
      _item.card_design_id,
      _item.quantity
    )
    RETURNING id INTO _batch_id;

    FOR _copy_no IN 1.._item.quantity LOOP
      _item_no := _item_no + 1;
      _claim_code := public.generate_claim_code();
      -- md5 over random value, time and order id is sufficient for the public
      -- registration token and does not require the pgcrypto extension.
      _token := md5(random()::text || clock_timestamp()::text || _order_id::text);

      INSERT INTO public.inventory_units (
        stock_batch_id,
        card_design_id,
        internal_inventory_code,
        business_status,
        fulfillment_status,
        traveler_user_id,
        order_id,
        order_item_id,
        public_claim_code,
        public_claim_token_hash,
        qr_generated_at
      )
      VALUES (
        _batch_id,
        _item.card_design_id,
        'POD-' || upper(substr(replace(_order_id::text, '-', ''), 1, 8)) || '-' || lpad(_item_no::text, 3, '0'),
        'purchased',
        'qr_generated',
        _order.user_id,
        _order_id::text,
        _item.id::text,
        _claim_code,
        -- This column also accepts legacy SHA-256 hashes. POD tokens are stored
        -- as an unguessable 32-character value because this database does not
        -- expose a server-side SHA-256 helper.
        _token,
        now()
      )
      RETURNING id INTO _unit_id;

      INSERT INTO public.qr_print_job_items (
        print_job_id, inventory_unit_id, public_claim_code, qr_url
      )
      VALUES (
        _job_id,
        _unit_id,
        _claim_code,
        '/r/' || _token
      );
    END LOOP;
  END LOOP;

  IF _item_no = 0 THEN
    RAISE EXCEPTION 'order_has_no_items';
  END IF;

  UPDATE public.qr_print_jobs
  SET status = 'ready', total_items = _item_no, generated_items = _item_no
  WHERE id = _job_id;

  RETURN _job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_pod_order_after_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_status = 'paid'
     AND (TG_OP = 'INSERT' OR OLD.payment_status IS DISTINCT FROM 'paid') THEN
    PERFORM public.prepare_pod_order(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prepare_pod_order_after_payment ON public.orders;
CREATE TRIGGER prepare_pod_order_after_payment
AFTER INSERT OR UPDATE OF payment_status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prepare_pod_order_after_payment();

-- Create QR tasks for any already-paid orders that predate this migration.
SELECT public.prepare_pod_order(id)
FROM public.orders
WHERE payment_status = 'paid'
  AND EXISTS (
    SELECT 1 FROM public.order_items oi WHERE oi.order_id = orders.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.qr_print_jobs q WHERE q.order_id = orders.id
  );
