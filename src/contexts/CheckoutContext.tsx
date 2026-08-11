import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";

export interface PickupPoint {
  name: string;
  address: string;
  city: string;
  provider?: "inpost" | "orlen";
  code?: string;
}

interface CheckoutContextType {
  pickupPoint: PickupPoint | null;
  setPickupPoint: (p: PickupPoint) => void;
  clearPickupPoint: () => void;
}

const STORAGE_KEY = "podrozowka_checkout";

const CheckoutContext = createContext<CheckoutContextType | undefined>(undefined);

export const CheckoutProvider = ({ children }: { children: ReactNode }) => {
  const [pickupPoint, setPickupPointState] = useState<PickupPoint | null>(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.name === "string") return parsed as PickupPoint;
      return null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (pickupPoint) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pickupPoint));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, [pickupPoint]);

  const setPickupPoint = useCallback((p: PickupPoint) => setPickupPointState(p), []);
  const clearPickupPoint = useCallback(() => setPickupPointState(null), []);

  const value = useMemo(
    () => ({ pickupPoint, setPickupPoint, clearPickupPoint }),
    [pickupPoint, setPickupPoint, clearPickupPoint]
  );

  return (
    <CheckoutContext.Provider value={value}>
      {children}
    </CheckoutContext.Provider>
  );
};

export const useCheckout = () => {
  const ctx = useContext(CheckoutContext);
  if (!ctx) throw new Error("useCheckout must be used within CheckoutProvider");
  return ctx;
};
