import { Link, useNavigate } from "react-router-dom";
import { ShoppingBag, Minus, Plus, X, AlertCircle } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { useCartItems } from "@/hooks/useCartItems";
import { useCartLanguageOptions } from "@/hooks/useCartLanguageOptions";
import { useAuth } from "@/hooks/useAuth";
import CartLanguagePicker from "@/components/cart/CartLanguagePicker";
import { useEffect } from "react";
import OrderSteps from "@/components/checkout/OrderSteps";

const formatPln = (grosze: number) =>
  (grosze / 100).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";

const Cart = () => {
  const { setQuantity, setSecondaryLanguage, removeItem, items: savedCartItems } = useCart();
  const { items, subtotalGrosze, isLoading, isError, error, refetch } = useCartItems();
  const { optionsByLineId } = useCartLanguageOptions(items);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Koszyk – Podróżówka";
  }, []);

  const handleCheckout = () => {
    if (!user) {
      navigate("/logowanie?redirect=/checkout");
      return;
    }
    navigate("/checkout");
  };

  // Product data is read asynchronously. Keep the loading state visible while
  // saved cart entries are being resolved, instead of briefly showing 0 items.
  const isResolvingItems = savedCartItems.length > 0 && items.length === 0 && !isError;
  const empty = savedCartItems.length === 0 && !isLoading;
  const totalCount = items.reduce((s, i) => s + (i.unavailable ? 0 : i.quantity), 0);
  const isBelowMin = totalCount < 10;
  const minOrderProgress = Math.min(100, (totalCount / 10) * 100);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main id="main-content" className="container mx-auto flex-1 px-4 pb-10 pt-24 md:pb-14 md:pt-28">
        <OrderSteps current={1} />
        <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-sm font-medium text-primary">Twoje zamówienie</p>
            <h1 className="font-display text-3xl font-bold text-foreground md:text-4xl">Koszyk</h1>
          </div>
          {!empty && <p className="text-sm text-muted-foreground">{totalCount} {totalCount === 1 ? "pocztówka" : "pocztówek"} w koszyku</p>}
        </div>

        {!empty && !isResolvingItems && isBelowMin && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-900 dark:text-amber-200 flex items-start gap-3 mb-6">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Minimalne zamówienie to 10 podróżówek</p>
              <p className="text-xs mt-0.5">
                Masz w koszyku <strong>{totalCount} szt.</strong> Dodaj jeszcze <strong>{10 - totalCount} szt.</strong>, aby złożyć zamówienie.
              </p>
            </div>
          </div>
        )}

        {(isLoading || isResolvingItems) && items.length === 0 ? (
          <div className="grid md:grid-cols-3 gap-6 animate-pulse">
            <div className="md:col-span-2 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3 p-4 bg-card rounded-xl">
                  <div className="w-20 h-20 bg-muted rounded" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
            <div className="h-40 bg-card rounded-xl" />
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center">
            <AlertCircle className="mx-auto mb-3 h-10 w-10 text-destructive" />
            <h2 className="font-display text-xl font-bold">Nie udało się wczytać produktów w koszyku</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
              Produkty nie zostały oznaczone jako niedostępne — wystąpił problem z pobraniem ich aktualnych danych.
              Spróbuj ponownie. Jeżeli problem wróci, nie przechodź do płatności.
            </p>
            <Button className="mt-4" variant="outline" onClick={() => refetch()}>
              Spróbuj ponownie
            </Button>
            {import.meta.env.DEV && error instanceof Error && (
              <p className="mt-3 break-words text-xs text-muted-foreground">DEV: {error.message}</p>
            )}
          </div>
        ) : empty ? (
          <div className="text-center py-16 bg-card rounded-xl shadow-soft">
            <ShoppingBag className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">Twój koszyk jest pusty</p>
            <Button asChild>
              <Link to="/sklep">Przejdź do sklepu</Link>
            </Button>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-3">
              {items.map((it) => {
                return (
                  <div key={it.id} className="bg-card rounded-xl shadow-soft p-4 flex gap-4">
                    <Link to={`/sklep/${it.card_design_id}`} className="shrink-0">
                      {it.image ? (
                        <img src={it.image} alt="" className="w-24 h-24 object-cover rounded" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-24 h-24 rounded bg-muted" />
                      )}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          {it.country_name && (
                            <p className="text-xs text-muted-foreground mb-0.5">{it.country_name}</p>
                          )}
                          <Link
                            to={`/sklep/${it.card_design_id}`}
                            className="font-display font-semibold hover:text-primary line-clamp-2"
                          >
                            {it.title || "Bez tytułu"}
                          </Link>
                          {!it.unavailable && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {formatPln(it.price_grosze)} / szt.
                            </p>
                          )}
                          {it.secondary_language && (
                            <p className="mt-1 text-xs font-medium text-primary">
                              Przód: język podstawowy / {it.secondary_language.name}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => removeItem(it.id)}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground shrink-0"
                          aria-label="Usuń"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {it.unavailable ? (
                        <div className="mt-3 flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded px-3 py-2">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>Produkt niedostępny — usuń pozycję, aby przejść dalej.</span>
                        </div>
                      ) : (
                        <>
                          <CartLanguagePicker
                            lineId={it.id}
                            value={it.secondary_language}
                            options={optionsByLineId.get(it.id) || []}
                            onChange={(language) => setSecondaryLanguage(it.id, language)}
                          />
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center border border-border rounded-lg">
                            <button
                              onClick={() =>
                                it.quantity <= 1 ? removeItem(it.id) : setQuantity(it.id, it.quantity - 1)
                              }
                              className="p-2 hover:bg-muted"
                              aria-label="Zmniejsz"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="px-3 min-w-8 text-center font-medium">{it.quantity}</span>
                            <button
                              onClick={() => setQuantity(it.id, it.quantity + 1)}
                              className="p-2 hover:bg-muted"
                              aria-label="Zwiększ"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                          <p className="font-display font-bold">{formatPln(it.price_grosze * it.quantity)}</p>
                          </div>
                        </>
                      )}

                    </div>
                  </div>
                );
              })}
            </div>

            <div>
              <div className="sticky top-28 space-y-4 rounded-2xl border border-border/70 bg-card p-5 shadow-card">
                <h2 className="font-display text-lg font-bold">Podsumowanie</h2>
                <div className="rounded-xl border border-border/70 bg-muted/35 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">Minimum zamówienia</span>
                    <span className={`font-semibold ${isBelowMin ? "text-amber-600 dark:text-amber-400" : "text-primary"}`}>
                      {totalCount} / 10 szt.
                    </span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-border"
                    role="progressbar"
                    aria-label="Postęp do minimalnego zamówienia"
                    aria-valuemin={0}
                    aria-valuemax={10}
                    aria-valuenow={Math.min(totalCount, 10)}
                  >
                    <div
                      className={`h-full rounded-full transition-[width] duration-300 ${isBelowMin ? "bg-amber-500" : "bg-primary"}`}
                      style={{ width: `${minOrderProgress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {isBelowMin
                      ? `Dobierz jeszcze ${10 - totalCount} szt., aby przejść do płatności.`
                      : "Minimum osiągnięte — możesz wybrać dostawę i płatność."}
                  </p>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Suma częściowa</span>
                  <span className="font-semibold">{formatPln(subtotalGrosze)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Koszt dostawy zostanie doliczony przy zamówieniu.
                </p>
                <Button size="lg" className="w-full" onClick={handleCheckout} disabled={subtotalGrosze === 0 || isBelowMin}>
                  Wybierz dostawę i płatność
                </Button>
                {isBelowMin && (
                  <Button asChild variant="outline" className="w-full">
                    <Link to="/sklep">Dobierz wzory w sklepie</Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Cart;
