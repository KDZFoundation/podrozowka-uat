-- Dodanie kolumny registered_country_iso2 do tabeli recipient_registrations
ALTER TABLE public.recipient_registrations
  ADD COLUMN IF NOT EXISTS registered_country_iso2 TEXT REFERENCES public.countries(iso2);

CREATE INDEX IF NOT EXISTS idx_recipient_registrations_country
  ON public.recipient_registrations(registered_country_iso2);

-- Aktualizacja RPC register_recipient do obsługi _registered_country_iso2
CREATE OR REPLACE FUNCTION public.register_recipient(
  _unit_id uuid,
  _recipient_name text,
  _recipient_message text,
  _recipient_email text,
  _contact_opt_in boolean,
  _latitude numeric,
  _longitude numeric,
  _registered_country_iso2 text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _status text;
BEGIN
  SELECT business_status INTO _status
  FROM public.inventory_units
  WHERE id = _unit_id
  FOR UPDATE;

  IF _status IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF _status = 'registered' THEN
    RAISE EXCEPTION 'already_registered';
  END IF;

  IF _status <> 'purchased' THEN
    RAISE EXCEPTION 'not_activated';
  END IF;

  INSERT INTO public.recipient_registrations(
    inventory_unit_id, recipient_name, recipient_message, recipient_email,
    contact_opt_in, latitude, longitude, registered_country_iso2
  ) VALUES (
    _unit_id, _recipient_name, _recipient_message, _recipient_email,
    _contact_opt_in, _latitude, _longitude, _registered_country_iso2
  );

  UPDATE public.inventory_units
  SET business_status = 'registered', registered_at = now()
  WHERE id = _unit_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_recipient(uuid, text, text, text, boolean, numeric, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_recipient(uuid, text, text, text, boolean, numeric, numeric, text) TO service_role;
