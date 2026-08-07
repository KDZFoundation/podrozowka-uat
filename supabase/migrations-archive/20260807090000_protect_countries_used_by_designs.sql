-- A country is a dictionary entry, while card designs and order history are business records.
-- Do not cascade from a country to designs: orders retain their historical design reference.
DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT conname
    INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'public.card_designs'::regclass
    AND confrelid = 'public.countries'::regclass
    AND contype = 'f';

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.card_designs DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

ALTER TABLE public.card_designs
  ADD CONSTRAINT card_designs_country_id_fkey
  FOREIGN KEY (country_id)
  REFERENCES public.countries(id)
  ON DELETE RESTRICT;
