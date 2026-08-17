import {
  CalendarDays,
  Landmark,
  Leaf,
  Palette,
  Tags,
  UserRound,
  type LucideIcon,
} from "lucide-react";

const categoryIcons: Record<string, LucideIcon> = {
  natura: Leaf,
  architektura: Landmark,
  sztuka: Palette,
  wydarzenie: CalendarDays,
  wydarzenia: CalendarDays,
  postacie: UserRound,
};

/** Gives every category a readable fallback when it has no uploaded icon. */
export const getCategoryIcon = (slug?: string | null): LucideIcon =>
  categoryIcons[(slug || "").toLowerCase()] || Tags;
