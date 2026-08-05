import { Link, useNavigate } from "react-router-dom";
import { ShoppingBag, Minus, Plus, X, AlertCircle } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { useCartItems } from "@/hooks/useCartItems";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";

const formatPln = (grosze: number) =>
  (grosze / 100).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";

const Cart = () => {
  const { setQuantity, removeItem } = useCart();
  const { items, subtotalGrosze, isLoading } = useCartItems();
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

  const empty = items.length === 0 && !isLoading;
  const totalCount = items.reduce((s, i) => s + (i.unavailable ? 0 : i.quantity), 0);
  const isBelowMin = totalCount < 10;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-8">Koszyk</h1>

        {!empty && isBelowMin && (
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

        {isLoading && items.length === 0 ? (
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
                const overStock = !it.unavailable && it.quantity > it.stock;
                return (
                  <div key={it.id} className="bg-card rounded-xl shadow-soft p-4 flex gap-4">
                    <Link to={`/sklep/${it.id}`} className="shrink-0">
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
                            to={`/sklep/${it.id}`}
                            className="font-display font-semibold hover:text-primary line-clamp-2"
                          >
                            {it.title || "Bez tytułu"}
                          </Link>
                          {!it.unavailable && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {formatPln(it.price_grosze)} / szt.
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
                              disabled={it.quantity >= it.stock}
                              className="p-2 hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                              aria-label="Zwiększ"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                          <p className="font-display font-bold">{formatPln(it.price_grosze * it.quantity)}</p>
                        </div>
                      )}

                      {overStock && (
                        <p className="mt-2 text-xs text-destructive">
                          Zmniejsz ilość — dostępne tylko {it.stock} szt.
                        </p>
                      )}
                      {!it.unavailable && !overStock && it.quantity === it.stock && it.stock > 0 && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          To maksymalna dostępna ilość ({it.stock} szt.).
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div>
              <div className="bg-card rounded-xl shadow-soft p-5 sticky top-24 space-y-4">
                <h2 className="font-display text-lg font-bold">Podsumowanie</h2>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Liczba sztuk</span>
                  <span className={`font-semibold ${isBelowMin ? "text-amber-600 dark:text-amber-400 font-bold" : ""}`}>
                    {totalCount} / 10 szt. (min)
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Suma częściowa</span>
                  <span className="font-semibold">{formatPln(subtotalGrosze)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Koszt dostawy zostanie doliczony przy zamówieniu.
                </p>
                <Button size="lg" className="w-full" onClick={handleCheckout} disabled={subtotalGrosze === 0 || isBelowMin}>
                  Przejdź do zamówienia
                </Button>
                {isBelowMin && (
                  <p className="text-xs text-center text-amber-600 dark:text-amber-400 font-medium">
                    Dodaj jeszcze {10 - totalCount} szt., aby odblokować zamówienie.
                  </p>
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
