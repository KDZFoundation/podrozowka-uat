-- Add category_id column to card_designs if it doesn't exist
ALTER TABLE public.card_designs
  ADD COLUMN IF NOT EXISTS category_id uuid NULL REFERENCES public.categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_card_designs_category_id ON public.card_designs(category_id);

-- Drop previous unique constraint on (country_id, view_no) if it exists and make it (country_id, category_id, view_no)
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.card_designs'::regclass
    AND contype = 'u'
    AND (
      SELECT array_agg(attname::text ORDER BY attname::text)
      FROM unnest(conkey) k
      JOIN pg_attribute a ON a.attrelid = 'public.card_designs'::regclass AND a.attnum = k
    ) = ARRAY['country_id','view_no']
  LIMIT 1;

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.card_designs DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.card_designs
  DROP CONSTRAINT IF EXISTS card_designs_country_category_view_uniq;

ALTER TABLE public.card_designs
  ADD CONSTRAINT card_designs_country_category_view_uniq
  UNIQUE (country_id, category_id, view_no);
