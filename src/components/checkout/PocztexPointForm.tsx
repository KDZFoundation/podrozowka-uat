import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PickupPoint } from "@/contexts/CheckoutContext";

interface Props {
  value: PickupPoint | null;
  onChange: (point: PickupPoint) => void;
}

const PocztexPointForm = ({ value, onChange }: Props) => {
  const current = value?.provider === "pocztex"
    ? value
    : { provider: "pocztex" as const, code: "", name: "", address: "", city: "" };
  const update = (field: "code" | "name" | "address" | "city", fieldValue: string) =>
    onChange({ ...current, [field]: fieldValue });

  return (
    <div className="grid gap-4 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="pocztex-point-code">Kod punktu Pocztex *</Label>
        <Input id="pocztex-point-code" value={current.code || ""} onChange={(event) => update("code", event.target.value)} placeholder="np. punkt odbioru" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pocztex-point-name">Nazwa punktu *</Label>
        <Input id="pocztex-point-name" value={current.name} onChange={(event) => update("name", event.target.value)} placeholder="Poczta / punkt partnerski" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pocztex-point-address">Adres punktu *</Label>
        <Input id="pocztex-point-address" value={current.address} onChange={(event) => update("address", event.target.value)} placeholder="Ulica i numer" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pocztex-point-city">Miejscowość *</Label>
        <Input id="pocztex-point-city" value={current.city} onChange={(event) => update("city", event.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-2">Do czasu uruchomienia mapy Pocztex dane punktu wpisz zgodnie z wyszukiwarką punktów Poczty Polskiej.</p>
    </div>
  );
};

export default PocztexPointForm;
