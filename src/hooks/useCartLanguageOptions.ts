import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { firestoreService } from "@/integrations/firebase/services/firestoreService";
import type { EnrichedCartItem } from "@/hooks/useCartItems";

export interface CartLanguageOption {
  code: string;
  name: string;
  front_text: string;
  back_text: string;
  is_primary: boolean;
}

/**
 * Returns all language choices for each cart line. The language list is scoped
 * to the country of that postcard, just like on the product page.
 */
export const useCartLanguageOptions = (items: EnrichedCartItem[]) => {
  const countryIds = useMemo(
    () => [...new Set(items.map((item) => item.country_id).filter((id): id is string => Boolean(id)))].sort(),
    [items],
  );
  const countryKey = countryIds.join(",");

  const query = useQuery({
    queryKey: ["cart-language-options", countryKey],
    enabled: countryIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const templates = await firestoreService.getLanguageTemplates();
      return templates
        .filter((template) => countryIds.includes(template.country_id))
        .sort((a, b) => a.language_name.localeCompare(b.language_name));
    },
  });

  const optionsByLineId = useMemo(() => {
    const all = query.data || [];
    return new Map(
      items.map((item) => [
        item.id,
        all
          .filter((template) => template.country_id === item.country_id)
          .map((template) => ({
            code: template.language_code,
            name: template.language_name,
            front_text: template.front_thank_you_text,
            back_text: template.back_qr_label,
            is_primary: Boolean(template.is_primary),
          })),
      ]),
    );
  }, [items, query.data]);

  return { optionsByLineId, isLoading: query.isLoading };
};
