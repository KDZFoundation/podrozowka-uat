-- Optional, admin-managed artwork for the country flag shown on postcard backs.
ALTER TABLE public.countries
  ADD COLUMN IF NOT EXISTS flag_url text;
