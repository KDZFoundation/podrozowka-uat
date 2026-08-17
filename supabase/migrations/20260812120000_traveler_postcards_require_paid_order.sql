-- POD lifecycle guard: an unpaid order must never expose postcard units to
-- its traveller.  Units are created by prepare_pod_order only after payment,
-- but this policy also protects against legacy or manually assigned units.

DROP POLICY IF EXISTS "Travelers can view own units" ON public.inventory_units;

CREATE POLICY "Travelers can view paid own units"
ON public.inventory_units
FOR SELECT
TO authenticated
USING (
  auth.uid() = traveler_user_id
  AND EXISTS (
    SELECT 1
    FROM public.orders AS o
    WHERE o.id::text = inventory_units.order_id
      AND o.user_id = auth.uid()
      AND o.payment_status = 'paid'
  )
);
