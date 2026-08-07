import { Package, Truck, Building2, Mail } from "lucide-react";
import type { ShippingMethod } from "@/lib/constants";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";

interface Props {
  value: ShippingMethod;
  onChange: (v: ShippingMethod) => void;
}

const allOptions: {
  value: ShippingMethod;
  label: string;
  description: string;
  icon: typeof Package;
  flagKey?: "inpost_shipping_enabled" | "orlen_paczka_enabled" | "pocztex_shipping_enabled";
}[] = [
  {
    value: "inpost",
    label: "Paczkomat InPost",
    description: "Odbiór w wybranym paczkomacie.",
    icon: Package,
    flagKey: "inpost_shipping_enabled",
  },
  {
    value: "courier",
    label: "Kurier — adres domowy",
    description: "Dostawa na wskazany adres.",
    icon: Truck,
  },
  {
    value: "orlen",
    label: "ORLEN Paczka",
    description: "Odbiór w automacie paczkowym lub stacji ORLEN.",
    icon: Building2,
    flagKey: "orlen_paczka_enabled",
  },
  {
    value: "pocztex",
    label: "Pocztex / Punkt Odbioru",
    description: "Odbiór na Poczcie, w Żabce lub Biedronce.",
    icon: Mail,
    flagKey: "pocztex_shipping_enabled",
  },
];

const ShippingMethodPicker = ({ value, onChange }: Props) => {
  const { flags } = useFeatureFlags();

  const options = allOptions.filter((opt) => {
    if (!opt.flagKey) return true;
    return flags[opt.flagKey] ?? true;
  });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = value === opt.value;
        return (
          <label
            key={opt.value}
            className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${
              active
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            }`}
          >
            <input
              type="radio"
              name="shipping_method"
              value={opt.value}
              checked={active}
              onChange={() => onChange(opt.value)}
              className="mt-1 accent-primary"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4 text-primary shrink-0" />
                <span className="font-medium text-foreground">{opt.label}</span>
              </div>
              <p className="text-sm text-muted-foreground">{opt.description}</p>
            </div>
          </label>
        );
      })}
    </div>
  );
};

export default ShippingMethodPicker;
