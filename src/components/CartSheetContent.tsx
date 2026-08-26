import { Link } from "react-router-dom";
import { ShoppingBag, X, Minus, Plus, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SheetClose, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCart } from "@/contexts/CartContext";
import { useCartItems } from "@/hooks/useCartItems";
import { useCartLanguageOptions } from "@/hooks/useCartLanguageOptions";
import CartLanguagePicker from "@/components/cart/CartLanguagePicker";

const formatPln = (grosze: number) =>
  (grosze / 100).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";

const CartSheetContent = () => {
  const { setQuantity, setLanguages, removeItem, items: savedCartItems } = useCart();
  const { items, subtotalGrosze, isLoading } = useCartItems();
  const { optionsByLineId } = useCartLanguageOptions(items);

  const isResolvingItems = savedCartItems.length > 0 && items.length === 0;
  const empty = savedCartItems.length === 0 && !isLoading;

  const totalCount = items.reduce((s, i) => s + (i.unavailable ? 0 : i.quantity), 0);
  const isBelowMin = totalCount < 10;

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <ShoppingBag className="w-5 h-5" />
          Twój koszyk
          {items.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              ({totalCount} szt.)
            </span>
          )}
        </SheetTitle>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto py-4">
        {(isLoading || isResolvingItems) && items.length === 0 ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse flex gap-3">
                <div className="w-16 h-16 bg-muted rounded" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : empty ? (
          <div className="text-center py-12">
            <ShoppingBag className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">Twój koszyk jest pusty</p>
            <SheetClose asChild>
              <Link
                to="/sklep"
                className="inline-flex items-center px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
              >
                Przejdź do sklepu
              </Link>
            </SheetClose>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((it) => (
              <div key={it.id} className="flex gap-3 pb-3 border-b border-border/60 last:border-0">
                <Link to={`/sklep/${it.card_design_id}`} className="shrink-0">
                  {it.image ? (
                    <img src={it.image} alt="" className="w-16 h-16 object-cover rounded" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-16 h-16 rounded bg-muted" />
                  )}
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/sklep/${it.card_design_id}`} className="text-sm font-medium line-clamp-2 hover:text-primary">
                      {it.title || "Podróżówka"}
                    </Link>
                    {it.secondary_language && (
                      <p className="mt-1 text-xs text-primary">
                        Języki: {it.primary_language?.name || "podstawowy"} / {it.secondary_language.name}
                      </p>
                    )}
                    <button
                      onClick={() => removeItem(it.id)}
                      className="p-1 rounded hover:bg-muted text-muted-foreground shrink-0"
                      aria-label="Usuń"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {!it.unavailable && (
                    <CartLanguagePicker
                      lineId={it.id}
                      primaryValue={it.primary_language}
                      secondaryValue={it.secondary_language}
                      options={optionsByLineId.get(it.id) || []}
                      onChange={(primaryLanguage, secondaryLanguage) => setLanguages(it.id, primaryLanguage, secondaryLanguage)}
                      compact
                    />
                  )}
                  {it.unavailable ? (
                    <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                      <AlertCircle className="w-3 h-3" /> Produkt niedostępny
                    </p>
                  ) : (
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center border border-border rounded">
                        <button
                          onClick={() =>
                            it.quantity <= 1 ? removeItem(it.id) : setQuantity(it.id, it.quantity - 1)
                          }
                          className="px-1.5 py-0.5 hover:bg-muted"
                          aria-label="Zmniejsz"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="px-2 text-sm min-w-6 text-center">{it.quantity}</span>
                        <button
                          onClick={() => setQuantity(it.id, it.quantity + 1)}
                          className="px-1.5 py-0.5 hover:bg-muted"
                          aria-label="Zwiększ"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-sm font-semibold">{formatPln(it.price_grosze * it.quantity)}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <SheetFooter className="border-t border-border pt-4">
          <div className="w-full space-y-3">
            {isBelowMin && (
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-800 dark:text-amber-200">
                ⚠️ Minimalne zamówienie: <strong>10 szt.</strong> (masz {totalCount} szt.)
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Suma częściowa</span>
              <span className="font-display text-lg font-bold">{formatPln(subtotalGrosze)}</span>
            </div>
            <SheetClose asChild>
              <Button asChild className="w-full">
                <Link to="/koszyk">Przejdź do koszyka</Link>
              </Button>
            </SheetClose>
          </div>
        </SheetFooter>
      )}
    </>
  );
};

export default CartSheetContent;
