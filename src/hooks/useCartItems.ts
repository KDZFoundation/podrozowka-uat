import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/contexts/CartContext";
import { getProductTitle } from "@/lib/productTitle";

export interface EnrichedCartItem {
  id: string;
  title: string | null;
  image: string | null;
  price_grosze: number;
  currency: string;
  quantity: number;
  unavailable: boolean;
  country_name: string | null;
}

interface CardDesignRow {
  id: string;
  title: string | null;
  image_front_url: string | null;
  price_grosze: number;
  currency: string;
  active: boolean;
  language_code: string;
  view_no: number;
  countries: { name_pl: string | null } | null;
  categories: { name: string | null } | null;
}

export const useCartItems = () => {
  const { items } = useCart();
  const ids = items.map((i) => i.card_design_id).sort();
  const key = ids.join(",");

  const query = useQuery({
    queryKey: ["cart-items", key],
    enabled: items.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: designs, error } = await supabase
        .from("card_designs")
        .select("id, title, image_front_url, price_grosze, currency, active, language_code, view_no, countries(name_pl), categories(name)")
        .in("id", ids);
      if (error) throw error;
      return (designs as unknown as CardDesignRow[]) || [];
    },
  });

  // The product lookup depends only on IDs, but quantities change locally.
  // Derive the cart rows from the current context on every render, otherwise
  // React Query would keep showing the quantity captured by its first fetch.
  const designMap = new Map<string, CardDesignRow>();
  (query.data || []).forEach((d) => designMap.set(d.id, d));
  const enriched: EnrichedCartItem[] = items.map((item) => {
    const d = designMap.get(item.card_design_id);
    const unavailable = !d || !d.active || d.price_grosze === 0;
    return {
      id: item.card_design_id,
      title: d ? getProductTitle(d) : null,
      image: d?.image_front_url ?? null,
      price_grosze: d?.price_grosze ?? 0,
      currency: d?.currency ?? "PLN",
      quantity: item.quantity,
      unavailable,
      country_name: d?.countries?.name_pl ?? null,
    };
  });
  const subtotalGrosze = enriched
    .filter((e) => !e.unavailable)
    .reduce((s, e) => s + e.price_grosze * e.quantity, 0);

  return {
    items: enriched,
    subtotalGrosze,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
};
