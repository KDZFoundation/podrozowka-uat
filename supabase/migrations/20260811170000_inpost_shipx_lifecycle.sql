-- Persists the ShipX lifecycle separately from the customer-facing shipment status.
ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS inpost_status text,
  ADD COLUMN IF NOT EXISTS inpost_offer_id text;

COMMENT ON COLUMN public.shipments.inpost_status IS
  'Last status returned by InPost ShipX, e.g. created, offers_prepared, confirmed.';
COMMENT ON COLUMN public.shipments.inpost_offer_id IS
  'Selected InPost ShipX offer used to purchase the shipment.';
