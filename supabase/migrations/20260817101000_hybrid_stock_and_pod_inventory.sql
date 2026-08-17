-- Hybrid inventory model:
--   POD   - units created automatically for paid online orders;
--   STOCK - physical batches produced for events, promotions and partners.

CREATE TABLE IF NOT EXISTS public.inventory_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  location_type text NOT NULL DEFAULT 'warehouse'
    CHECK (location_type IN ('warehouse', 'event', 'partner', 'transit')),
  address text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.inventory_locations (code, name, location_type)
VALUES ('MAIN', 'Magazyn główny', 'warehouse')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.stock_production_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE DEFAULT (
    'STK-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5))
  ),
  name text NOT NULL,
  purpose text NOT NULL,
  distribution_channel text NOT NULL DEFAULT 'warehouse'
    CHECK (distribution_channel IN ('warehouse', 'event', 'promotion', 'partner')),
  event_name text,
  partner_name text,
  location_id uuid REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('draft', 'ordered', 'in_production', 'received', 'closed', 'cancelled')),
  total_quantity integer NOT NULL DEFAULT 0 CHECK (total_quantity >= 0),
  ordered_at timestamptz,
  received_at timestamptz,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_batches
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'stock'
    CHECK (source_type IN ('stock', 'pod')),
  ADD COLUMN IF NOT EXISTS purpose text,
  ADD COLUMN IF NOT EXISTS distribution_channel text NOT NULL DEFAULT 'warehouse'
    CHECK (distribution_channel IN ('warehouse', 'event', 'promotion', 'partner', 'ecommerce')),
  ADD COLUMN IF NOT EXISTS event_name text,
  ADD COLUMN IF NOT EXISTS partner_name text,
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS production_status text NOT NULL DEFAULT 'received'
    CHECK (production_status IN ('draft', 'ordered', 'in_production', 'received', 'closed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS received_at timestamptz;

ALTER TABLE public.stock_batches
  ADD COLUMN IF NOT EXISTS production_order_id uuid
  REFERENCES public.stock_production_orders(id) ON DELETE RESTRICT;

UPDATE public.stock_batches
SET source_type = 'pod',
    distribution_channel = 'ecommerce',
    production_status = CASE
      WHEN production_status = 'received' THEN 'ordered'
      ELSE production_status
    END
WHERE name LIKE 'POD %';

UPDATE public.stock_batches
SET location_id = (SELECT id FROM public.inventory_locations WHERE code = 'MAIN'),
    received_at = COALESCE(received_at, created_at)
WHERE source_type = 'stock'
  AND location_id IS NULL;

ALTER TABLE public.inventory_units
  ADD COLUMN IF NOT EXISTS current_location_id uuid REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS distribution_note text,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

UPDATE public.inventory_units iu
SET current_location_id = sb.location_id
FROM public.stock_batches sb
WHERE sb.id = iu.stock_batch_id
  AND iu.current_location_id IS NULL;

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_unit_id uuid NOT NULL REFERENCES public.inventory_units(id) ON DELETE CASCADE,
  stock_batch_id uuid NOT NULL REFERENCES public.stock_batches(id) ON DELETE RESTRICT,
  movement_type text NOT NULL
    CHECK (movement_type IN ('created', 'received', 'allocated', 'issued', 'returned', 'transferred', 'adjusted', 'voided', 'damaged')),
  from_location_id uuid REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  to_location_id uuid REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  reference_type text,
  reference_id text,
  note text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_movements_unit_idx
  ON public.inventory_movements (inventory_unit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_batch_idx
  ON public.inventory_movements (stock_batch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_units_location_idx
  ON public.inventory_units (current_location_id);
CREATE INDEX IF NOT EXISTS stock_batches_source_idx
  ON public.stock_batches (source_type, production_status, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_batches_production_order_idx
  ON public.stock_batches (production_order_id);

ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_production_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Travelers can view paid own units" ON public.inventory_units;
DROP POLICY IF EXISTS "Travelers can view own units" ON public.inventory_units;
CREATE POLICY "Travelers can view paid or assigned own units"
ON public.inventory_units
FOR SELECT TO authenticated
USING (
  auth.uid() = traveler_user_id
  AND (
    (
      order_id IS NULL
      AND business_status IN ('assigned', 'registered')
    )
    OR EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id::text = inventory_units.order_id
        AND o.user_id = auth.uid()
        AND o.payment_status = 'paid'
    )
  )
);

CREATE POLICY "Admins can manage inventory locations"
  ON public.inventory_locations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage inventory movements"
  ON public.inventory_movements
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage stock production orders"
  ON public.stock_production_orders
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_stock_production_orders_updated_at ON public.stock_production_orders;
CREATE TRIGGER update_stock_production_orders_updated_at
BEFORE UPDATE ON public.stock_production_orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.prepare_stock_batch_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.name LIKE 'POD %' THEN
    NEW.source_type := 'pod';
    NEW.distribution_channel := 'ecommerce';
    IF NEW.production_status = 'received' THEN
      NEW.production_status := 'ordered';
    END IF;
    NEW.location_id := NULL;
    NEW.received_at := NULL;
  ELSIF NEW.source_type = 'stock' AND NEW.location_id IS NULL THEN
    SELECT id INTO NEW.location_id
    FROM public.inventory_locations
    WHERE code = 'MAIN';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prepare_stock_batch_defaults ON public.stock_batches;
CREATE TRIGGER prepare_stock_batch_defaults
BEFORE INSERT OR UPDATE ON public.stock_batches
FOR EACH ROW EXECUTE FUNCTION public.prepare_stock_batch_defaults();

CREATE OR REPLACE FUNCTION public.record_initial_inventory_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _source_type text;
BEGIN
  SELECT source_type INTO _source_type
  FROM public.stock_batches
  WHERE id = NEW.stock_batch_id;

  INSERT INTO public.inventory_movements (
    inventory_unit_id, stock_batch_id, movement_type, to_location_id,
    reference_type, reference_id, actor_id
  ) VALUES (
    NEW.id,
    NEW.stock_batch_id,
    CASE WHEN _source_type = 'stock' THEN 'received' ELSE 'created' END,
    NEW.current_location_id,
    CASE WHEN _source_type = 'stock' THEN 'stock_batch' ELSE 'order' END,
    CASE WHEN _source_type = 'stock' THEN NEW.stock_batch_id::text ELSE NEW.order_id END,
    auth.uid()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS record_initial_inventory_movement ON public.inventory_units;
CREATE TRIGGER record_initial_inventory_movement
AFTER INSERT ON public.inventory_units
FOR EACH ROW EXECUTE FUNCTION public.record_initial_inventory_movement();

INSERT INTO public.inventory_movements (
  inventory_unit_id, stock_batch_id, movement_type, to_location_id,
  reference_type, reference_id, note
)
SELECT
  iu.id,
  iu.stock_batch_id,
  CASE WHEN sb.source_type = 'stock' THEN 'received' ELSE 'created' END,
  iu.current_location_id,
  CASE WHEN sb.source_type = 'stock' THEN 'stock_batch' ELSE 'order' END,
  CASE WHEN sb.source_type = 'stock' THEN iu.stock_batch_id::text ELSE iu.order_id END,
  'Wpis początkowy utworzony podczas wdrożenia modelu hybrydowego.'
FROM public.inventory_units iu
JOIN public.stock_batches sb ON sb.id = iu.stock_batch_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.inventory_movements im
  WHERE im.inventory_unit_id = iu.id
);

CREATE OR REPLACE FUNCTION public.guard_inventory_unit_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.business_status = 'registered'
     OR OLD.fulfillment_status IN ('shipped', 'issued')
     OR OLD.registered_at IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM public.recipient_registrations rr
       WHERE rr.inventory_unit_id = OLD.id
     ) THEN
    RAISE EXCEPTION 'protected_inventory_unit_cannot_be_deleted';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS guard_inventory_unit_delete ON public.inventory_units;
CREATE TRIGGER guard_inventory_unit_delete
BEFORE DELETE ON public.inventory_units
FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_unit_delete();

CREATE OR REPLACE FUNCTION public.delete_order_with_inventory_cleanup(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _batch_ids uuid[];
  _deleted_units integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin_access_required';
  END IF;

  PERFORM 1 FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pod_production_batch_orders
    WHERE order_id = _order_id
  ) THEN
    RAISE EXCEPTION 'order_already_in_production_batch';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.inventory_units
    WHERE order_id = _order_id::text
      AND (
        business_status = 'registered'
        OR fulfillment_status IN ('shipped', 'issued')
        OR registered_at IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'order_has_protected_inventory_units';
  END IF;

  SELECT array_agg(DISTINCT stock_batch_id) INTO _batch_ids
  FROM public.inventory_units
  WHERE order_id = _order_id::text;

  DELETE FROM public.qr_print_job_items qji
  USING public.qr_print_jobs qj
  WHERE qji.print_job_id = qj.id
    AND qj.order_id = _order_id;

  DELETE FROM public.qr_print_jobs WHERE order_id = _order_id;
  DELETE FROM public.inventory_units WHERE order_id = _order_id::text;
  GET DIAGNOSTICS _deleted_units = ROW_COUNT;

  DELETE FROM public.shipments WHERE order_id = _order_id;
  DELETE FROM public.orders WHERE id = _order_id;

  IF _batch_ids IS NOT NULL THEN
    DELETE FROM public.stock_batches sb
    WHERE sb.id = ANY(_batch_ids)
      AND sb.source_type = 'pod'
      AND NOT EXISTS (
        SELECT 1 FROM public.inventory_units iu
        WHERE iu.stock_batch_id = sb.id
      );
  END IF;

  RETURN jsonb_build_object('success', true, 'deleted_units', _deleted_units);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_order_with_inventory_cleanup(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_order_with_inventory_cleanup(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_assign_stock_unit(
  _unit_id uuid,
  _traveler_email text,
  _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  _traveler_id uuid;
  _unit public.inventory_units%ROWTYPE;
  _source_type text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin_access_required';
  END IF;

  SELECT id INTO _traveler_id
  FROM auth.users
  WHERE lower(email) = lower(trim(_traveler_email))
  LIMIT 1;

  IF _traveler_id IS NULL THEN
    RAISE EXCEPTION 'traveler_account_not_found';
  END IF;

  SELECT * INTO _unit
  FROM public.inventory_units
  WHERE id = _unit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory_unit_not_found';
  END IF;

  SELECT source_type INTO _source_type
  FROM public.stock_batches
  WHERE id = _unit.stock_batch_id;
  IF _source_type <> 'stock' THEN
    RAISE EXCEPTION 'only_stock_units_can_be_manually_assigned';
  END IF;
  IF _unit.business_status IS NOT NULL OR _unit.traveler_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'inventory_unit_already_assigned';
  END IF;
  IF _unit.fulfillment_status NOT IN ('in_stock', 'allocated', 'qr_generated', 'qr_applied') THEN
    RAISE EXCEPTION 'inventory_unit_not_available';
  END IF;

  UPDATE public.inventory_units
  SET traveler_user_id = _traveler_id,
      business_status = 'assigned',
      fulfillment_status = 'issued',
      assigned_at = now(),
      distribution_note = NULLIF(trim(_note), '')
  WHERE id = _unit_id;

  RETURN jsonb_build_object(
    'success', true,
    'inventory_unit_id', _unit_id,
    'traveler_user_id', _traveler_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_assign_stock_unit(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_assign_stock_unit(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_inventory_unit_state_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.business_status = 'registered'
     AND NEW.business_status IS DISTINCT FROM 'registered' THEN
    RAISE EXCEPTION 'registered_inventory_unit_is_immutable';
  END IF;

  IF OLD.fulfillment_status IN ('shipped', 'issued')
     AND NEW.fulfillment_status IN ('in_stock', 'reserved', 'allocated') THEN
    RAISE EXCEPTION 'distributed_inventory_unit_cannot_return_without_return_movement';
  END IF;

  IF NEW.business_status IN ('purchased', 'assigned', 'registered')
     AND NEW.traveler_user_id IS NULL THEN
    RAISE EXCEPTION 'traveler_required_for_assigned_inventory_unit';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_inventory_unit_state_change ON public.inventory_units;
CREATE TRIGGER guard_inventory_unit_state_change
BEFORE UPDATE ON public.inventory_units
FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_unit_state_change();

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
      WHEN 'in_stock' THEN 'returned'
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

DROP TRIGGER IF EXISTS record_inventory_status_movement ON public.inventory_units;
CREATE TRIGGER record_inventory_status_movement
AFTER UPDATE ON public.inventory_units
FOR EACH ROW EXECUTE FUNCTION public.record_inventory_status_movement();

-- The baseline accidentally installed the same event logger twice.
DROP TRIGGER IF EXISTS trg_inventory_unit_events ON public.inventory_units;

CREATE OR REPLACE FUNCTION public.register_recipient(
  _unit_id uuid,
  _recipient_name text,
  _recipient_message text,
  _recipient_email text,
  _contact_opt_in boolean,
  _latitude numeric,
  _longitude numeric,
  _registered_country_iso2 text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _status public.business_status;
BEGIN
  SELECT business_status INTO _status
  FROM public.inventory_units
  WHERE id = _unit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF _status = 'registered' THEN
    RAISE EXCEPTION 'already_registered';
  END IF;
  IF _status NOT IN ('purchased', 'assigned') THEN
    RAISE EXCEPTION 'not_activated';
  END IF;

  INSERT INTO public.recipient_registrations (
    inventory_unit_id, recipient_name, recipient_message, recipient_email,
    contact_opt_in, latitude, longitude, registered_country_iso2
  ) VALUES (
    _unit_id, _recipient_name, _recipient_message, _recipient_email,
    _contact_opt_in, _latitude, _longitude, _registered_country_iso2
  );

  UPDATE public.inventory_units
  SET business_status = 'registered', registered_at = now()
  WHERE id = _unit_id;
END;
$$;

COMMENT ON TABLE public.inventory_locations IS
  'Physical warehouse, event, partner and transit locations for STOCK inventory.';
COMMENT ON TABLE public.inventory_movements IS
  'Immutable movement history for physical STOCK and automatically created POD units.';
COMMENT ON TABLE public.stock_production_orders IS
  'One physical print-shop order containing one or more per-design stock batches.';
COMMENT ON COLUMN public.stock_batches.source_type IS
  'stock = physical bulk inventory; pod = units created for a paid online order.';
