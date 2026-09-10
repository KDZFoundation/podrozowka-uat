import type { ReactNode } from "react";
import { Building2, CheckCircle2, ChevronDown, Mail, MapPin, Package, Truck } from "lucide-react";
import type { ShippingMethod } from "@/lib/constants";

interface Props {
  value: ShippingMethod;
  onChange: (v: ShippingMethod) => void;
  renderOptionDetails?: (method: ShippingMethod) => ReactNode;
  enabledMethods?: readonly ShippingMethod[];
}

type DeliveryOption = {
  value: ShippingMethod;
  label: string;
  description: string;
  icon: typeof Package;
};

type DeliveryGroup = {
  id: "inpost" | "orlen" | "pocztex";
  label: string;
  description: string;
  icon: typeof Package;
  options: DeliveryOption[];
};

const deliveryGroups: DeliveryGroup[] = [
  {
    id: "inpost",
    label: "InPost",
    description: "Paczkomat lub dostawa pod adres.",
    icon: Package,
    options: [
      { value: "inpost_locker", label: "Paczkomat InPost", description: "Odbiór 24/7 w wybranym Paczkomacie.", icon: MapPin },
      { value: "inpost_courier", label: "InPost Kurier", description: "Dostawa kurierem pod wskazany adres.", icon: Truck },
    ],
  },
  {
    id: "orlen",
    label: "ORLEN Paczka",
    description: "Automat paczkowy, stacja ORLEN lub punkt partnerski.",
    icon: Building2,
    options: [
      { value: "orlen_paczka", label: "Punkt ORLEN Paczka", description: "Wybierz wygodny punkt odbioru.", icon: MapPin },
    ],
  },
  {
    id: "pocztex",
    label: "Pocztex",
    description: "Punkt odbioru lub dostawa pod adres.",
    icon: Mail,
    options: [
      { value: "pocztex_point", label: "Pocztex Punkt", description: "Odbiór w placówce lub punkcie partnerskim.", icon: MapPin },
      { value: "pocztex_courier", label: "Pocztex Kurier", description: "Dostawa kurierem pod wskazany adres.", icon: Truck },
    ],
  },
];

const groupForMethod = (method: ShippingMethod, groups: DeliveryGroup[]) =>
  groups.find((group) => group.options.some((option) => option.value === method))?.id;

const ShippingMethodPicker = ({ value, onChange, renderOptionDetails, enabledMethods }: Props) => {
  const visibleGroups = deliveryGroups
    .map((group) => ({
      ...group,
      options: enabledMethods ? group.options.filter((option) => enabledMethods.includes(option.value)) : group.options,
    }))
    .filter((group) => group.options.length > 0);
  const selectedGroupId = groupForMethod(value, visibleGroups);

  return (
    <div className="space-y-3">
      {visibleGroups.map((group) => {
        const GroupIcon = group.icon;
        const expanded = group.id === selectedGroupId;

        return (
          <section
            key={group.id}
            className={`overflow-hidden rounded-xl border transition-colors ${
              expanded ? "border-primary bg-primary/[0.03]" : "border-border bg-background hover:border-primary/50"
            }`}
          >
            <button
              type="button"
              className="flex w-full items-center gap-3 p-4 text-left"
              onClick={() => {
                if (!expanded) onChange(group.options[0].value);
              }}
              aria-expanded={expanded}
              aria-controls={`shipping-options-${group.id}`}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${expanded ? "bg-primary text-primary-foreground" : "bg-muted text-primary"}`}>
                <GroupIcon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-semibold text-foreground">
                  {group.label}
                  {expanded && <CheckCircle2 className="h-4 w-4 text-primary" aria-label="Wybrany przewoźnik" />}
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{group.description}</span>
              </span>
              <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>

            {expanded && (
              <fieldset id={`shipping-options-${group.id}`} className="border-t border-primary/15 px-4 pb-4 pt-3">
                <legend className="px-0 text-xs font-medium text-muted-foreground">Wybierz sposób dostawy</legend>
                <div className="mt-2 space-y-2">
                  {group.options.map((option) => {
                    const OptionIcon = option.icon;
                    const active = value === option.value;

                    return (
                      <div
                        key={option.value}
                        className={`rounded-lg border transition-colors ${
                          active ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/50"
                        }`}
                      >
                        <label className="flex cursor-pointer items-start gap-3 p-3">
                          <input
                            type="radio"
                            name="shipping_method"
                            value={option.value}
                            checked={active}
                            onChange={() => onChange(option.value)}
                            className="mt-1 accent-primary"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 font-medium text-foreground">
                              <OptionIcon className="h-4 w-4 shrink-0 text-primary" />
                              {option.label}
                            </span>
                            <span className="mt-1 block text-sm text-muted-foreground">{option.description}</span>
                          </span>
                        </label>
                        {active && renderOptionDetails && (
                          <div className="border-t border-primary/15 px-3 pb-3 pt-3">
                            {renderOptionDetails(option.value)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            )}
          </section>
        );
      })}
    </div>
  );
};

export default ShippingMethodPicker;
