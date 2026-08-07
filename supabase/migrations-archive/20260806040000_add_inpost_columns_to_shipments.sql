-- Add InPost ShipX columns to public.shipments
ALTER TABLE public.shipments ADD COLUMN IF NOT EXISTS inpost_shipment_id text;
ALTER TABLE public.shipments ADD COLUMN IF NOT EXISTS label_url text;
ALTER TABLE public.shipments ADD COLUMN IF NOT EXISTS size text;
