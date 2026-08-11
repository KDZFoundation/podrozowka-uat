import type { CartSecondaryLanguage } from "@/contexts/CartContext";
import type { CartLanguageOption } from "@/hooks/useCartLanguageOptions";

interface CartLanguagePickerProps {
  lineId: string;
  value?: CartSecondaryLanguage;
  options: CartLanguageOption[];
  onChange: (language?: CartSecondaryLanguage) => void;
  compact?: boolean;
}

const CartLanguagePicker = ({ lineId, value, options, onChange, compact = false }: CartLanguagePickerProps) => {
  if (options.length === 0) return null;

  return (
    <div className={compact ? "mt-2" : "mt-3 rounded-lg border border-border/70 bg-muted/30 p-3"}>
      <label htmlFor={`cart-language-${lineId}`} className="block text-xs font-semibold text-foreground">
        Dodatkowy język na przodzie <span className="font-normal text-muted-foreground">(opcjonalnie)</span>
      </label>
      {!compact && (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Zmienia napis z podziękowaniem na przodzie tej pozycji. Tył z kodem QR pozostaje bez zmian.
        </p>
      )}
      <select
        id={`cart-language-${lineId}`}
        value={value?.code || ""}
        onChange={(event) => {
          const language = options.find((option) => option.code === event.target.value);
          onChange(language ? { code: language.code, name: language.name, front_text: language.front_text } : undefined);
        }}
        className="mt-2 w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary"
      >
        <option value="">Tylko język podstawowy</option>
        {options.map((option) => (
          <option key={option.code} value={option.code}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
};

export default CartLanguagePicker;
