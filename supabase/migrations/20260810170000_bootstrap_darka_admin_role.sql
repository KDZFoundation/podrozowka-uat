-- Access to the administrator panel must be granted by public.user_roles,
-- never by an e-mail exception embedded in frontend code. This is idempotent:
-- it applies only when this administrative account exists in a given project.

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(email) = 'fundacja@d-arka.org'
ON CONFLICT (user_id, role) DO NOTHING;
