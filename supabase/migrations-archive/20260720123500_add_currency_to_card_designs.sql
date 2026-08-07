-- Ensure price_grosze, currency, description, and updated_at columns are on card_designs
ALTER TABLE public.card_designs
  ADD COLUMN IF NOT EXISTS price_grosze integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'PLN',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now());
