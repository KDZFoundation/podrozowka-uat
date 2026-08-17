-- Firmino integration foundation, intentionally separate from product code assignment.
-- No external request is made by this migration.

ALTER TABLE public.card_designs
  ADD COLUMN IF NOT EXISTS firmino_article_id bigint,
  ADD COLUMN IF NOT EXISTS firmino_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS firmino_sync_error text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fiscal_provider text;

UPDATE public.orders
SET fiscal_provider = 'merit'
WHERE fiscal_provider IS NULL AND fiscal_document_external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS card_designs_firmino_sync_pending_idx
  ON public.card_designs(active, firmino_synced_at)
  WHERE active = true AND firmino_synced_at IS NULL;
