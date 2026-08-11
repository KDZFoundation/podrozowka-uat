-- Author registry for licensing, attribution and card-design ownership.
CREATE TABLE IF NOT EXISTS public.authors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  legal_name text,
  email text,
  website_url text,
  social_handle text,
  bio text,
  avatar_url text,
  agreement_status text NOT NULL DEFAULT 'draft'
    CHECK (agreement_status IN ('draft', 'sent', 'signed', 'expired', 'terminated')),
  agreement_signed_at timestamptz,
  agreement_expires_at timestamptz,
  agreement_file_url text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.card_designs
  ADD COLUMN IF NOT EXISTS author_id uuid REFERENCES public.authors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS authors_status_idx ON public.authors(agreement_status, active);
CREATE INDEX IF NOT EXISTS card_designs_author_id_idx ON public.card_designs(author_id);

ALTER TABLE public.authors ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.authors TO authenticated;
GRANT ALL ON public.authors TO service_role;

DROP POLICY IF EXISTS "Admins can manage authors" ON public.authors;
CREATE POLICY "Admins can manage authors" ON public.authors
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS authors_updated_at ON public.authors;
CREATE TRIGGER authors_updated_at
  BEFORE UPDATE ON public.authors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
