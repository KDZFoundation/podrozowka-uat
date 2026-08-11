-- Configure the Storage bucket used by country flags, category icons and
-- postcard photos. Storage metadata is managed separately from public schema
-- baselines, so it must be provisioned explicitly in each environment.

INSERT INTO storage.buckets (id, name, public)
VALUES ('postcard-photos', 'postcard-photos', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = true;

DROP POLICY IF EXISTS "Public read access to postcard-photos" ON storage.objects;
CREATE POLICY "Public read access to postcard-photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'postcard-photos');

DROP POLICY IF EXISTS "Admins can upload postcard photos" ON storage.objects;
CREATE POLICY "Admins can upload postcard photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'postcard-photos'
    AND public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Admins can update postcard photos" ON storage.objects;
CREATE POLICY "Admins can update postcard photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'postcard-photos'
    AND public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    bucket_id = 'postcard-photos'
    AND public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Admins can delete postcard photos" ON storage.objects;
CREATE POLICY "Admins can delete postcard photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'postcard-photos'
    AND public.has_role(auth.uid(), 'admin')
  );
