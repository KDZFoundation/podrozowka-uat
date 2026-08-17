-- Daily POD batches are independent from carrier shipments. A batch contains
-- one production PDF (postcards) and an address manifest for the print shop.
-- Carrier labels remain attached to individual shipments and are created only
-- through the selected carrier integration.

CREATE TABLE IF NOT EXISTS public.pod_production_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number text NOT NULL UNIQUE,
  production_date date NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'prepared', 'sent_to_printer', 'closed', 'failed')),
  scheduled_for timestamptz,
  total_orders integer NOT NULL DEFAULT 0 CHECK (total_orders >= 0),
  total_postcards integer NOT NULL DEFAULT 0 CHECK (total_postcards >= 0),
  printer_email text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  prepared_at timestamptz,
  sent_to_printer_at timestamptz,
  notes text
);

CREATE TABLE IF NOT EXISTS public.pod_production_batch_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.pod_production_batches(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  print_job_id uuid NOT NULL REFERENCES public.qr_print_jobs(id) ON DELETE RESTRICT,
  order_number text NOT NULL,
  postcard_count integer NOT NULL CHECK (postcard_count > 0),
  shipping_method text NOT NULL,
  recipient_name text,
  recipient_email text,
  recipient_street text,
  recipient_postal_code text,
  recipient_city text,
  pickup_point_code text,
  pickup_point_name text,
  pickup_point_address text,
  pickup_point_city text,
  carrier_label_status text NOT NULL DEFAULT 'pending'
    CHECK (carrier_label_status IN ('pending', 'created', 'purchased', 'printed', 'not_available')),
  carrier_label_url text,
  tracking_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, order_id),
  UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS pod_production_batches_date_idx
  ON public.pod_production_batches (production_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS pod_production_batch_orders_batch_idx
  ON public.pod_production_batch_orders (batch_id);
CREATE INDEX IF NOT EXISTS pod_production_batch_orders_print_job_idx
  ON public.pod_production_batch_orders (print_job_id);

ALTER TABLE public.pod_production_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pod_production_batch_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage POD production batches"
  ON public.pod_production_batches
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage POD production batch orders"
  ON public.pod_production_batch_orders
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.pod_production_batches IS
  'Daily POD production batches. One batch produces one combined SRA3 postcard PDF and one shipping manifest.';
COMMENT ON TABLE public.pod_production_batch_orders IS
  'Frozen fulfilment/address data per order for a POD batch; not a carrier label itself.';
