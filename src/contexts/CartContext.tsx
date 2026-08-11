import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { trackEvent } from "@/lib/analytics";

export interface CartProductSnapshot {
  title: string;
  image_front_url: string | null;
  price_grosze: number;
  currency: string;
  country_name: string | null;
}

export interface CartSecondaryLanguage {
  code: string;
  name: string;
  front_text: string;
}

export interface CartItem {
  card_design_id: string;
  quantity: number;
  secondary_language?: CartSecondaryLanguage;
  /**
   * The product representation visible when a traveler added the item.
   * The server still validates price and availability at checkout, but this
   * keeps the cart readable when a relation lookup is temporarily unavailable.
   */
  product?: CartProductSnapshot;
}

interface CartContextValue {
  items: CartItem[];
  totalCount: number;
  getQuantity: (id: string, secondaryLanguageCode?: string) => number;
  addItem: (id: string, qty?: number, maxQuantity?: number, product?: CartProductSnapshot, secondaryLanguage?: CartSecondaryLanguage) => void;
  removeItem: (id: string) => void;
  setQuantity: (id: string, qty: number) => void;
  setSecondaryLanguage: (id: string, secondaryLanguage?: CartSecondaryLanguage) => void;
  clear: () => void;
}

const STORAGE_KEY = "podrozowka_cart";

export const cartLineId = (cardDesignId: string, secondaryLanguageCode?: string) =>
  secondaryLanguageCode ? `${cardDesignId}::lang:${secondaryLanguageCode}` : cardDesignId;

const CartContext = createContext<CartContextValue | undefined>(undefined);

const isProductSnapshot = (value: unknown): value is CartProductSnapshot => {
  if (!value || typeof value !== "object") return false;
  const product = value as CartProductSnapshot;
  return (
    typeof product.title === "string" &&
    (typeof product.image_front_url === "string" || product.image_front_url === null) &&
    typeof product.price_grosze === "number" &&
    Number.isFinite(product.price_grosze) &&
    typeof product.currency === "string" &&
    (typeof product.country_name === "string" || product.country_name === null)
  );
};

const isSecondaryLanguage = (value: unknown): value is CartSecondaryLanguage => {
  if (!value || typeof value !== "object") return false;
  const language = value as CartSecondaryLanguage;
  return typeof language.code === "string" && typeof language.name === "string" && typeof language.front_text === "string";
};

const readInitial = (): CartItem[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (it: unknown): it is CartItem =>
          !!it &&
          typeof it === "object" &&
          typeof (it as CartItem).card_design_id === "string" &&
          typeof (it as CartItem).quantity === "number" &&
          (it as CartItem).quantity > 0,
      )
      .map((it) => {
        const product = isProductSnapshot(it.product) ? it.product : undefined;
        const secondaryLanguage = isSecondaryLanguage(it.secondary_language) ? it.secondary_language : undefined;
        return {
          card_design_id: it.card_design_id,
          quantity: Math.floor(it.quantity),
          ...(product ? { product } : {}),
          ...(secondaryLanguage ? { secondary_language: secondaryLanguage } : {}),
        };
      });
  } catch {
    return [];
  }
};

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<CartItem[]>(readInitial);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* ignore quota errors */
    }
  }, [items]);

  const getQuantity = useCallback(
    (id: string, secondaryLanguageCode?: string) => items.find((i) => cartLineId(i.card_design_id, i.secondary_language?.code) === cartLineId(id, secondaryLanguageCode))?.quantity ?? 0,
    [items],
  );

  const addItem = useCallback((id: string, qty: number = 1, maxQuantity?: number, product?: CartProductSnapshot, secondaryLanguage?: CartSecondaryLanguage) => {
    trackEvent("cart_item_added", { quantity: qty });
    setItems((prev) => {
      const currentTotal = prev.reduce((sum, item) => sum + item.quantity, 0);
      if (currentTotal < 10 && currentTotal + qty >= 10) {
        trackEvent("cart_reached_minimum", { total: currentTotal + qty });
      }
      const lineId = cartLineId(id, secondaryLanguage?.code);
      const existing = prev.find((i) => cartLineId(i.card_design_id, i.secondary_language?.code) === lineId);
      if (existing) {
        const next = existing.quantity + qty;
        const clamped = maxQuantity !== undefined ? Math.min(next, maxQuantity) : next;
        return prev.map((i) =>
          cartLineId(i.card_design_id, i.secondary_language?.code) === lineId
            ? { ...i, quantity: clamped, ...(product ? { product } : {}), ...(secondaryLanguage ? { secondary_language: secondaryLanguage } : {}) }
            : i,
        );
      }
      const clamped = maxQuantity !== undefined ? Math.min(qty, maxQuantity) : qty;
      return [
        ...prev,
        {
          card_design_id: id,
          quantity: Math.max(1, clamped),
          ...(product ? { product } : {}),
          ...(secondaryLanguage ? { secondary_language: secondaryLanguage } : {}),
        },
      ];
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => cartLineId(i.card_design_id, i.secondary_language?.code) !== id));
  }, []);

  const setQuantity = useCallback((id: string, qty: number) => {
    setItems((prev) => {
      if (qty <= 0) return prev.filter((i) => cartLineId(i.card_design_id, i.secondary_language?.code) !== id);
      return prev.map((i) =>
        cartLineId(i.card_design_id, i.secondary_language?.code) === id
          ? { ...i, quantity: Math.floor(qty) }
          : i,
      );
    });
  }, []);

  // Language is part of a cart-line identity: the same design printed with a
  // different front language must be sent to print as a separate line. When a
  // traveler changes the language in the cart, merge it with an existing
  // matching line instead of duplicating the printed postcards.
  const setSecondaryLanguage = useCallback((id: string, secondaryLanguage?: CartSecondaryLanguage) => {
    setItems((prev) => {
      const source = prev.find((item) => cartLineId(item.card_design_id, item.secondary_language?.code) === id);
      if (!source) return prev;

      const targetId = cartLineId(source.card_design_id, secondaryLanguage?.code);
      if (targetId === id) return prev;

      const target = prev.find((item) => cartLineId(item.card_design_id, item.secondary_language?.code) === targetId);
      const nextSource: CartItem = {
        ...source,
        ...(secondaryLanguage ? { secondary_language: secondaryLanguage } : { secondary_language: undefined }),
      };

      if (target) {
        return prev
          .filter((item) => cartLineId(item.card_design_id, item.secondary_language?.code) !== id)
          .map((item) =>
            cartLineId(item.card_design_id, item.secondary_language?.code) === targetId
              ? { ...item, quantity: item.quantity + source.quantity }
              : item,
          );
      }

      return prev.map((item) =>
        cartLineId(item.card_design_id, item.secondary_language?.code) === id ? nextSource : item,
      );
    });
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const totalCount = useMemo(() => items.reduce((s, i) => s + i.quantity, 0), [items]);

  const value = useMemo(
    () => ({ items, totalCount, getQuantity, addItem, removeItem, setQuantity, setSecondaryLanguage, clear }),
    [items, totalCount, getQuantity, addItem, removeItem, setQuantity, setSecondaryLanguage, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
};
