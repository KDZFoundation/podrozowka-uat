import { CreditCard, Banknote } from "lucide-react";
import type { PaymentMethod } from "@/lib/constants";
import { SHIPPING_COST_GROSZE, COD_SHIPPING_COST_GROSZE } from "@/lib/constants";
import { useFeatureFlag } from "@/hooks/useFeatureFlags";
import { useEffect } from "react";

const formatPln = (grosze: number) =>
  (grosze / 100).toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " zł";

interface Props {
  value: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
}

const options: {
  value: PaymentMethod;
  title: string;
  description: string;
  cost: number;
  icon: typeof CreditCard;
}[] = [
  {
    value: "online",
    title: "Płatność online (BLIK / karta)",
    description: "Szybko i wygodnie — HotPay.",
    cost: SHIPPING_COST_GROSZE,
    icon: CreditCard,
  },
  {
    value: "cod",
    title: "Za pobraniem",
    description: "Zapłać gotówką lub kartą przy odbiorze w paczkomacie.",
    cost: COD_SHIPPING_COST_GROSZE,
    icon: Banknote,
  },
];

const PaymentMethodPicker = ({ value, onChange }: Props) => {
  const codEnabled = useFeatureFlag("cod_payment_enabled");

  const visibleOptions = codEnabled
    ? options
    : options.filter((opt) => opt.value === "online");

  useEffect(() => {
    if (!codEnabled && value !== "online") {
      onChange("online");
    }
  }, [codEnabled, value, onChange]);

  return (
    <div className="space-y-3">
      {visibleOptions.map((opt) => {
        const selected = value === opt.value;
        const Icon = opt.icon;
        return (
          <label
            key={opt.value}
            className={`flex items-start gap-3 border rounded-xl p-4 cursor-pointer transition-colors ${
              selected
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            }`}
          >
            {visibleOptions.length > 1 && (
              <input
                type="radio"
                name="payment-method"
                value={opt.value}
                checked={selected}
                onChange={() => onChange(opt.value)}
                className="mt-1 accent-primary"
              />
            )}
            <Icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="font-medium text-foreground">{opt.title}</p>
                <p className="text-sm font-medium whitespace-nowrap">
                  Dostawa {formatPln(opt.cost)}
                </p>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {opt.description}
              </p>
            </div>
          </label>
        );
      })}
    </div>
  );
};

export default PaymentMethodPicker;
