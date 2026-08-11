CREATE TABLE IF NOT EXISTS public.shipping_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  inpost_environment text NOT NULL DEFAULT 'sandbox' CHECK (inpost_environment IN ('sandbox', 'production')),
  inpost_organization_id text,
  inpost_api_token text,
  inpost_geowidget_token text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shipping_settings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.shipping_settings IS
  'Server-managed logistics credentials. Read and write is performed only by Edge Functions with service-role access.';
