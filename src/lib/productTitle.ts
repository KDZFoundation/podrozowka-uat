export interface ProductTitleSource {
  title?: string | null;
  view_no?: number | null;
  language_code?: string | null;
  countries?: { name_pl?: string | null } | null;
  categories?: { name?: string | null } | null;
}

/**
 * Product titles are optional in the creator.  The storefront still needs a
 * clear, repeatable name, so it derives one from the saved design metadata.
 */
export const getProductTitle = (design: ProductTitleSource): string => {
  const savedTitle = design.title?.trim();
  if (savedTitle) return savedTitle;

  const country = design.countries?.name_pl?.trim() || "Nieznany kraj";
  const categoryInitial = design.categories?.name?.trim().charAt(0).toLocaleUpperCase("pl-PL") || "O";
  const view = String(design.view_no ?? 1).padStart(2, "0");
  const language = design.language_code?.trim().toUpperCase() || "PL";

  return `Podróżówka ${country}, ${categoryInitial} V${view} ${language}`;
};
