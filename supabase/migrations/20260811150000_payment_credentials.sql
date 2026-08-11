-- Store Przelewy24 credentials in the protected database configuration.
-- The application never returns these values to the browser; Edge Functions
-- read them with the service role and only expose masked status information.
CREATE TABLE IF NOT EXISTS public.payment_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  p24_mode text NOT NULL DEFAULT 'sandbox' CHECK (p24_mode IN ('sandbox', 'production')),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_settings
  ADD COLUMN IF NOT EXISTS p24_merchant_id text,
  ADD COLUMN IF NOT EXISTS p24_pos_id text,
  ADD COLUMN IF NOT EXISTS p24_api_key text,
  ADD COLUMN IF NOT EXISTS p24_crc_key text,
  ADD COLUMN IF NOT EXISTS p24_report_key text;

GRANT SELECT ON public.payment_settings TO authenticated;
GRANT ALL ON public.payment_settings TO service_role;

ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'payment_settings' AND policyname = 'Admins can read payment settings') THEN
    CREATE POLICY "Admins can read payment settings"
      ON public.payment_settings FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'payment_settings' AND policyname = 'Admins can update payment settings') THEN
    CREATE POLICY "Admins can update payment settings"
      ON public.payment_settings FOR UPDATE TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'payment_settings' AND policyname = 'Admins can insert payment settings') THEN
    CREATE POLICY "Admins can insert payment settings"
      ON public.payment_settings FOR INSERT TO authenticated
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

INSERT INTO public.payment_settings (singleton, p24_mode)
VALUES (true, 'sandbox')
ON CONFLICT (singleton) DO NOTHING;
