-- HotPay is the primary online payment gateway. Przelewy24 remains available
-- as a configured fallback, but the active gateway is selected explicitly.
ALTER TABLE public.payment_settings
  ADD COLUMN IF NOT EXISTS payment_gateway text NOT NULL DEFAULT 'hotpay',
  ADD COLUMN IF NOT EXISTS hotpay_secret text,
  ADD COLUMN IF NOT EXISTS hotpay_notification_password text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payment_settings_payment_gateway_check'
      AND conrelid = 'public.payment_settings'::regclass
  ) THEN
    ALTER TABLE public.payment_settings
      ADD CONSTRAINT payment_settings_payment_gateway_check
      CHECK (payment_gateway IN ('hotpay', 'p24'));
  END IF;
END $$;

-- Existing installations become HotPay-first after this migration. Credentials
-- are intentionally not copied from or exposed alongside Przelewy24 values.
UPDATE public.payment_settings
SET payment_gateway = 'hotpay'
WHERE payment_gateway IS NULL OR payment_gateway NOT IN ('hotpay', 'p24');
