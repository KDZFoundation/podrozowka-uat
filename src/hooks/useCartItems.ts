import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { firestoreService } from "@/integrations/firebase/services/firestoreService";
import { isFirestoreCatalogEnabled } from "@/integrations/firebase/config";
import { cartLineId, type CartSecondaryLanguage, useCart } from "@/contexts/CartContext";
import { getProductTitle } from "@/lib/productTitle";

export interface EnrichedCartItem {
  id: string;
  card_design_id: string;
  title: string | null;
  image: string | null;
  price_grosze: number;
  currency: string;
  quantity: number;
  unavailable: boolean;
  country_id: string | null;
  language_code: string | null;
  country_name: string | null;
  secondary_language?: CartSecondaryLanguage;
}

interface CardDesignRow {
  id: string;
  title: string | null;
  image_front_url: string | null;
  price_grosze: number;
  currency: string;
  active: boolean;
  country_id: string;
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
      if (isFirestoreCatalogEnabled) {
        const designs = await Promise.all(ids.map((id) => firestoreService.getCardDesignById(id)));
        return designs.filter(Boolean).map((design) => ({
          id: design!.id,
          title: design!.title,
          image_front_url: design!.image_front_url || design!.image_thumb_url || null,
          price_grosze: design!.price_grosze,
          currency: design!.currency,
          active: design!.active,
          country_id: design!.country_id || "",
          language_code: design!.language_code,
          view_no: design!.view_no,
          countries: null,
          categories: null,
        } satisfies CardDesignRow));
      }
      const { data: designs, error } = await supabase
        .from("card_designs")
        .select("id, title, image_front_url, price_grosze, currency, active, country_id, language_code, view_no, countries(name_pl), categories(name)")
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
    const snapshot = item.product;
    // A fresh database row is authoritative. The local snapshot is a display
    // fallback only; checkout still validates the design server-side.
    const unavailable = d ? !d.active || d.price_grosze === 0 : !snapshot;
    return {
      id: cartLineId(item.card_design_id, item.secondary_language?.code),
      card_design_id: item.card_design_id,
      title: d ? getProductTitle(d) : snapshot?.title ?? null,
      image: d?.image_front_url ?? snapshot?.image_front_url ?? null,
      price_grosze: d?.price_grosze ?? snapshot?.price_grosze ?? 0,
      currency: d?.currency ?? snapshot?.currency ?? "PLN",
      quantity: item.quantity,
      unavailable,
      country_id: d?.country_id ?? null,
      language_code: d?.language_code ?? null,
      country_name: d?.countries?.name_pl ?? snapshot?.country_name ?? null,
      ...(item.secondary_language ? { secondary_language: item.secondary_language } : {}),
    };
  });
  const subtotalGrosze = enriched
    .filter((e) => !e.unavailable)
    .reduce((s, e) => s + e.price_grosze * e.quantity, 0);

  return {
    items: enriched,
    subtotalGrosze,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
};
