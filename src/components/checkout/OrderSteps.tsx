import { CheckCircle2, ShoppingBag, Truck } from "lucide-react";

interface Props {
  current: 1 | 2 | 3;
}

const steps = [
  { label: "Koszyk", icon: ShoppingBag },
  { label: "Dostawa", icon: Truck },
  { label: "Potwierdzenie", icon: CheckCircle2 },
];

const OrderSteps = ({ current }: Props) => (
  <ol className="mb-8 grid grid-cols-3 overflow-hidden rounded-xl border border-border bg-card text-xs shadow-soft sm:flex sm:items-center sm:justify-start sm:gap-0">
    {steps.map((step, index) => {
      const stepNumber = index + 1;
      const active = stepNumber === current;
      const complete = stepNumber < current;
      const Icon = step.icon;

      return (
        <li
          key={step.label}
          className={`flex min-w-0 items-center justify-center gap-1.5 px-2 py-3 font-medium sm:min-w-36 sm:px-4 ${
            active ? "bg-primary text-primary-foreground" : complete ? "bg-primary/10 text-primary" : "text-muted-foreground"
          }`}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{step.label}</span>
        </li>
      );
    })}
  </ol>
);

export default OrderSteps;
