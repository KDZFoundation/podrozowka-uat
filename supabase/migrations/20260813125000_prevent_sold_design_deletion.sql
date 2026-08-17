-- A postcard design sold in a paid order is part of the order history.
-- It may be archived (active = false), but must never be physically removed.

CREATE OR REPLACE FUNCTION public.prevent_sold_card_design_deletion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.card_design_id = OLD.id
      AND o.payment_status = 'paid'
  ) THEN
    RAISE EXCEPTION 'sold_card_design_cannot_be_deleted'
      USING ERRCODE = 'integrity_constraint_violation',
            HINT = 'Archive the product by setting active to false instead.';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS card_designs_prevent_sold_deletion ON public.card_designs;
CREATE TRIGGER card_designs_prevent_sold_deletion
  BEFORE DELETE ON public.card_designs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_sold_card_design_deletion();

COMMENT ON FUNCTION public.prevent_sold_card_design_deletion() IS
  'Protects sold product designs from deletion; archive through active = false.';
