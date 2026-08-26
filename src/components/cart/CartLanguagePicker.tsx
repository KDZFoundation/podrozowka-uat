import type { CartLanguage, CartSecondaryLanguage } from "@/contexts/CartContext";
import type { CartLanguageOption } from "@/hooks/useCartLanguageOptions";

interface CartLanguagePickerProps {
  lineId: string;
  primaryValue?: CartLanguage;
  secondaryValue?: CartSecondaryLanguage;
  options: CartLanguageOption[];
  onChange: (primaryLanguage: CartLanguage, secondaryLanguage?: CartSecondaryLanguage) => void;
  compact?: boolean;
}

const toCartLanguage = (language: CartLanguageOption): CartLanguage => ({
  code: language.code,
  name: language.name,
  front_text: language.front_text,
  back_text: language.back_text,
});

const CartLanguagePicker = ({ lineId, primaryValue, secondaryValue, options, onChange, compact = false }: CartLanguagePickerProps) => {
  if (options.length === 0) return null;

  const selectedPrimary =
    options.find((option) => option.code === primaryValue?.code) ||
    options.find((option) => option.is_primary) ||
    options[0];
  const secondaryOptions = options.filter((option) => option.code !== selectedPrimary.code);

  return (
    <div className={compact ? "mt-2" : "mt-3 rounded-lg border border-border/70 bg-muted/30 p-3"}>
      <label htmlFor={`cart-primary-language-${lineId}`} className="block text-xs font-semibold text-foreground">
        Język podstawowy
      </label>
      {!compact && (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Możesz zmienić język podstawowy wyłącznie dla tej pozycji w koszyku.
        </p>
      )}
      <select
        id={`cart-primary-language-${lineId}`}
        value={selectedPrimary.code}
        onChange={(event) => {
          const primaryLanguage = options.find((option) => option.code === event.target.value);
          if (!primaryLanguage) return;
          onChange(
            toCartLanguage(primaryLanguage),
            secondaryValue?.code === primaryLanguage.code ? undefined : secondaryValue,
          );
        }}
        className="mt-2 w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary"
      >
        {options.map((option) => (
          <option key={option.code} value={option.code}>
            {option.name}
          </option>
        ))}
      </select>

      <label htmlFor={`cart-secondary-language-${lineId}`} className="mt-3 block text-xs font-semibold text-foreground">
        Dodatkowy język <span className="font-normal text-muted-foreground">(opcjonalnie)</span>
      </label>
      {!compact && (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Dodaje drugi język na przodzie i tyle tej pozycji. Kod QR na tyle pozostaje ten sam.
        </p>
      )}
      <select
        id={`cart-secondary-language-${lineId}`}
        value={secondaryValue?.code || ""}
        onChange={(event) => {
          const language = secondaryOptions.find((option) => option.code === event.target.value);
          onChange(toCartLanguage(selectedPrimary), language ? toCartLanguage(language) : undefined);
        }}
        className="mt-2 w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary"
      >
        <option value="">Tylko język podstawowy</option>
        {secondaryOptions.map((option) => (
          <option key={option.code} value={option.code}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
};

export default CartLanguagePicker;
