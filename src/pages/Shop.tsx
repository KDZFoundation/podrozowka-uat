import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Info, Package, ShoppingBag, ShoppingCart, Tags, X } from "lucide-react";
import { toast } from "sonner";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { getProductTitle } from "@/lib/productTitle";
import { useCart } from "@/contexts/CartContext";

interface Country {
  id: string;
  iso2: string;
  name_pl: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  icon_url: string | null;
  sort_order: number;
}

interface Product {
  id: string;
  title: string | null;
  image_front_url: string | null;
  price_grosze: number;
  country_id: string;
  category_id: string | null;
  language_code: string;
  view_no: number;
  countries: Country | null;
  categories: Category | null;
}

const formatPln = (grosze: number) =>
  (grosze / 100).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";

const Shop = () => {
  const [searchParams] = useSearchParams();
  const countryIso = searchParams.get("country_iso");
  const { totalCount, addItem } = useCart();

  const [products, setProducts] = useState<Product[]>([]);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    document.title = "Sklep – Podróżówka";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Kartki pocztowe promujące polską kulturę na świecie. Wybierz z katalogu i wyślij za granicę.");
  }, []);

  useEffect(() => {
    const load = async () => {
      const [{ data: designs }, { data: cats }] = await Promise.all([
        supabase
          .from("card_designs")
          .select("id, title, image_front_url, price_grosze, country_id, category_id, language_code, view_no, countries!inner(id, iso2, name_pl), categories(id, name, slug, icon_url, sort_order)")
          .eq("active", true)
          .gt("price_grosze", 0)
          .order("created_at", { ascending: false }),
        supabase.from("categories").select("id, name, slug, icon_url, sort_order").order("sort_order").order("name"),
      ]);

      setProducts((designs as unknown as Product[]) || []);
      setAllCategories((cats as Category[]) || []);
      if (countryIso && designs) {
        const found = (designs as unknown as Product[]).find(
          (d) => d.countries?.iso2?.toLowerCase() === countryIso.toLowerCase()
        );
        if (found) {
          setCountryFilter(found.country_id);
        }
      }

      setIsLoading(false);
    };
    load();
  }, [countryIso]);

  const countries = useMemo(() => {
    const map = new Map<string, Country>();
    products.forEach((p) => {
      if (p.countries) map.set(p.countries.id, p.countries);
    });
    return Array.from(map.values()).sort((a, b) => a.name_pl.localeCompare(b.name_pl, "pl"));
  }, [products]);

  const visible = useMemo(
    () =>
      products.filter(
        (p) =>
          (countryFilter === "all" || p.country_id === countryFilter) &&
          (categoryFilter === "all" || p.category_id === categoryFilter),
      ),
    [products, countryFilter, categoryFilter],
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main id="main-content" className="container mx-auto flex-1 px-4 pb-10 pt-24 md:pb-14 md:pt-28">
        <div className="mb-8 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/[0.06] px-4 py-3.5 text-sm text-foreground md:items-center md:px-5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Info className="h-4 w-4" aria-hidden="true" />
          </span>
          <p>
            <span className="font-semibold">Drukujemy po opłaceniu zamówienia</span>
            <span className="text-muted-foreground"> — minimalne zamówienie: </span>
            <span className="font-semibold">10 Podróżówek.</span>
          </p>
        </div>
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-primary mb-2">
              <ShoppingBag className="w-5 h-5" />
              <span className="text-sm font-medium uppercase tracking-wider">Katalog</span>
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground">Sklep</h1>
            <p className="text-muted-foreground mt-2 max-w-2xl">
              Wybierz kartkę pocztową i zabierz kawałek polskiej kultury w podróż.
            </p>
          </div>
          <Link
            to="/koszyk"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <ShoppingCart className="h-4 w-4" />
            Koszyk
            <span className="rounded-full bg-primary-foreground/20 px-2 py-0.5 text-xs">
              {totalCount} {totalCount === 1 ? "szt." : "szt."}
            </span>
          </Link>
        </div>

        <section className="mb-8 rounded-2xl border border-border/70 bg-card p-4 shadow-soft">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Tags className="h-3.5 w-3.5" />
                <span>Filtry katalogu</span>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="flex min-w-48 flex-col gap-1.5 text-xs font-medium text-muted-foreground">
                  Kraj docelowy
                  <select
                    value={countryFilter}
                    onChange={(e) => setCountryFilter(e.target.value)}
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground"
                  >
                    <option value="all">Wszystkie kraje</option>
                    {countries.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name_pl}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-1 flex-wrap gap-2 sm:pt-5">
                  <button
                    onClick={() => setCategoryFilter("all")}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors ${
                      categoryFilter === "all"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:bg-muted"
                    }`}
                  >
                    Wszystkie
                  </button>
                  {allCategories.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCategoryFilter(c.id)}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors ${
                        categoryFilter === c.id
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-foreground hover:bg-muted"
                      }`}
                    >
                      {c.icon_url && (
                        <img src={c.icon_url} alt="" className="h-5 w-5 rounded-full object-cover" referrerPolicy="no-referrer" />
                      )}
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 border-t border-border/70 pt-3 text-sm lg:shrink-0 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
              <span className="text-muted-foreground">
                Wyniki: <strong className="text-foreground">{visible.length}</strong>
              </span>
              {(countryFilter !== "all" || categoryFilter !== "all") && (
                <button
                  type="button"
                  onClick={() => { setCountryFilter("all"); setCategoryFilter("all"); }}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                >
                  <X className="h-3.5 w-3.5" /> Wyczyść
                </button>
              )}
            </div>
          </div>
        </section>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-card rounded-xl shadow-soft overflow-hidden animate-pulse">
                <div className="aspect-[3/2] bg-muted" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                  <div className="h-5 bg-muted rounded w-1/3 mt-3" />
                </div>
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16">
            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Brak dostępnych produktów</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {visible.map((p) => {
              const productTitle = getProductTitle(p);
              return (
                <article
                  key={p.id}
                  className="group rounded-2xl border border-border/70 bg-card p-3 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-lg"
                >
                  <Link to={`/sklep/${p.id}`} className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <div className="relative aspect-[1.42/1] overflow-hidden rounded-xl bg-muted shadow-sm">
                      {p.image_front_url ? (
                        <img
                          src={p.image_front_url}
                          alt={productTitle}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-8 h-8 text-muted-foreground" />
                        </div>
                      )}
                      <div className="absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5">
                        {p.countries && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-background/90 px-2.5 py-1 text-xs font-semibold text-foreground shadow-sm backdrop-blur-sm">
                            <img
                              src={`https://flagcdn.com/w40/${p.countries.iso2.toLowerCase()}.png`}
                              alt=""
                              className="h-3.5 w-5 rounded-[2px] object-cover"
                            />
                            {p.countries.name_pl}
                          </span>
                        )}
                        {p.categories && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-white/40 bg-background/90 px-2.5 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm">
                            {p.categories.icon_url && (
                              <img src={p.categories.icon_url} alt="" className="w-4 h-4 rounded-full object-cover" referrerPolicy="no-referrer" />
                            )}
                            {p.categories.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <h2 className="min-h-12 px-1 pt-4 font-display text-lg font-semibold leading-snug text-foreground line-clamp-2">
                      {productTitle}
                    </h2>
                  </Link>
                  <div className="mt-4 flex items-center justify-between gap-3 px-1 pb-1">
                    <p className="font-display text-xl font-bold text-primary">{formatPln(p.price_grosze)}</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          addItem(p.id, 1);
                          toast.success("Dodano 1 Podróżówkę do koszyka");
                        }}
                        className="rounded-lg border border-primary/30 px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
                        aria-label={`Dodaj 1 sztukę: ${productTitle}`}
                      >
                        Dodaj 1
                      </button>
                      <Link to={`/sklep/${p.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                        Wybierz
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Shop;
