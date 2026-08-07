-- Add fiscal document columns to public.orders table if they do not exist
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fiscal_document_status text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fiscal_document_number text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fiscal_document_error text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fiscal_document_external_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fiscal_document_issued_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fiscal_document_url text;
