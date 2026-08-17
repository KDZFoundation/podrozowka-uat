-- Public storefront: expose only aggregated sales ranking, never order data.
CREATE OR REPLACE FUNCTION public.get_popular_card_designs(_limit integer DEFAULT 20)
RETURNS TABLE(card_design_id uuid, sold_quantity bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT oi.card_design_id, SUM(oi.quantity)::bigint AS sold_quantity
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.payment_status = 'paid'
  GROUP BY oi.card_design_id
  ORDER BY SUM(oi.quantity) DESC, MAX(o.created_at) DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 20), 1), 20);
$$;

REVOKE ALL ON FUNCTION public.get_popular_card_designs(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_popular_card_designs(integer) TO anon, authenticated;
