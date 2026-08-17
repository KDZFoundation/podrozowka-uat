-- Stable product codes for postcard designs.
-- This migration does not call Firmino, create sales documents, or change
-- the checkout flow. Firmino-specific fields are added separately.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS product_code_prefix text;

UPDATE public.categories
SET product_code_prefix = CASE lower(coalesce(slug, ''))
  WHEN 'natura' THEN 'NAT'
  WHEN 'nature' THEN 'NAT'
  WHEN 'architektura' THEN 'ARC'
  WHEN 'architecture' THEN 'ARC'
  WHEN 'sztuka' THEN 'SZT'
  WHEN 'art' THEN 'SZT'
  WHEN 'wydarzenia' THEN 'WYD'
  WHEN 'events' THEN 'WYD'
  WHEN 'postacie' THEN 'POS'
  WHEN 'characters' THEN 'POS'
  ELSE 'OTH'
END
WHERE product_code_prefix IS NULL OR btrim(product_code_prefix) = '';

ALTER TABLE public.categories
  ALTER COLUMN product_code_prefix SET DEFAULT 'OTH';

ALTER TABLE public.categories
  ALTER COLUMN product_code_prefix SET NOT NULL;

ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_product_code_prefix_format;

ALTER TABLE public.categories
  ADD CONSTRAINT categories_product_code_prefix_format
  CHECK (product_code_prefix ~ '^[A-Z0-9]{2,8}$');

ALTER TABLE public.card_designs
  ADD COLUMN IF NOT EXISTS product_code text;

CREATE OR REPLACE FUNCTION public.make_firmino_product_code(
  _country_id uuid,
  _category_id uuid,
  _view_no integer,
  _language_code text
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT format(
    'PDZ-%s-%s-%s-%s',
    upper(coalesce(nullif(btrim(c.iso2), ''), 'XX')),
    upper(coalesce(nullif(btrim(cat.product_code_prefix), ''), 'OTH')),
    lpad(greatest(coalesce(_view_no, 0), 0)::text, 4, '0'),
    upper(coalesce(nullif(btrim(_language_code), ''), 'PL'))
  )
  FROM public.countries c
  LEFT JOIN public.categories cat ON cat.id = _category_id
  WHERE c.id = _country_id
$$;

UPDATE public.card_designs d
SET product_code = public.make_firmino_product_code(d.country_id, d.category_id, d.view_no, d.language_code)
WHERE product_code IS NULL OR btrim(product_code) = '';

ALTER TABLE public.card_designs
  ALTER COLUMN product_code SET NOT NULL;

ALTER TABLE public.card_designs
  DROP CONSTRAINT IF EXISTS card_designs_view_no_catalog_range;

ALTER TABLE public.card_designs
  ADD CONSTRAINT card_designs_view_no_catalog_range
  CHECK (view_no BETWEEN 1 AND 9999);

ALTER TABLE public.card_designs
  DROP CONSTRAINT IF EXISTS card_designs_product_code_length;

ALTER TABLE public.card_designs
  ADD CONSTRAINT card_designs_product_code_length CHECK (char_length(product_code) <= 40);

CREATE UNIQUE INDEX IF NOT EXISTS card_designs_product_code_key
  ON public.card_designs(product_code);

CREATE OR REPLACE FUNCTION public.assign_card_design_product_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.product_code IS NULL OR btrim(NEW.product_code) = '' THEN
    NEW.product_code := public.make_firmino_product_code(
      NEW.country_id,
      NEW.category_id,
      NEW.view_no,
      NEW.language_code
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS card_designs_assign_product_code ON public.card_designs;
CREATE TRIGGER card_designs_assign_product_code
  BEFORE INSERT ON public.card_designs
  FOR EACH ROW EXECUTE FUNCTION public.assign_card_design_product_code();

COMMENT ON COLUMN public.card_designs.product_code IS
  'Stable product code for Firmino. Never reuse QR, claim or inventory identifiers here.';
