-- Public author catalogue: deliberately exposes only presentation fields.
CREATE OR REPLACE VIEW public.author_profiles AS
SELECT id, display_name, bio, avatar_url, social_handle, website_url
FROM public.authors
WHERE active = true;

GRANT SELECT ON public.author_profiles TO anon, authenticated;
