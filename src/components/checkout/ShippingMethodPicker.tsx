import { Package, Truck, Building2, Mail, MapPin } from "lucide-react";
import type { ShippingMethod } from "@/lib/constants";

interface Props {
  value: ShippingMethod;
  onChange: (v: ShippingMethod) => void;
}

const allOptions: {
  value: ShippingMethod;
  label: string;
  description: string;
  icon: typeof Package;
}[] = [
  {
    value: "inpost_locker",
    label: "InPost Paczkomat 24/7",
    description: "Odbiór w wybranym Paczkomacie.",
    icon: Package,
  },
  {
    value: "inpost_courier",
    label: "InPost Kurier",
    description: "Dostawa kurierem InPost pod wskazany adres.",
    icon: Truck,
  },
  {
    value: "orlen_paczka",
    label: "ORLEN Paczka",
    description: "Odbiór w automacie paczkowym lub stacji ORLEN.",
    icon: Building2,
  },
  {
    value: "pocztex_courier",
    label: "Pocztex Kurier",
    description: "Dostawa kurierem Pocztex pod wskazany adres.",
    icon: Mail,
  },
  {
    value: "pocztex_point",
    label: "Pocztex Punkt",
    description: "Odbiór w wybranym punkcie Pocztex.",
    icon: MapPin,
  },
];

const ShippingMethodPicker = ({ value, onChange }: Props) => {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {allOptions.map((opt) => {
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
