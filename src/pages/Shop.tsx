import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Info, Package, ShoppingBag, ShoppingCart, Tags, X } from "lucide-react";
import { toast } from "sonner";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { firestoreService } from "@/integrations/firebase/services/firestoreService";
import { isUsingFirebaseEmulators } from "@/integrations/firebase/config";
import { getProductTitle } from "@/lib/productTitle";
import { useCart } from "@/contexts/CartContext";
import { getCategoryIcon } from "@/lib/categoryIcons";
import { PostcardFront, type CropSettings } from "@/components/postcard/PostcardFront";

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
  photo_author: string | null;
  thank_you_text: string | null;
  crop_settings: CropSettings | null;
  price_grosze: number;
  country_id: string;
  category_id: string | null;
  language_code: string;
  view_no: number;
  countries: Country | null;
  categories: Category | null;
}

const formatPln = (grosze: number) =>
  (grosze / 100).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "\u00a0zł";

const Shop = () => {
  const [searchParams] = useSearchParams();
  const countryIso = searchParams.get("country_iso");
  const { totalCount, addItem } = useCart();

  const [products, setProducts] = useState<Product[]>([]);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [quantitiesToAdd, setQuantitiesToAdd] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    document.title = "Sklep – Podróżówka";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Kartki pocztowe promujące polską kulturę na świecie. Wybierz z katalogu i wyślij za granicę.");
  }, []);

  useEffect(() => {
    const loadFilters = async () => {
      let rawCategories: Category[] = [];
      let rawCountries: Country[] = [];

      if (!isUsingFirebaseEmulators) {
        try {
          const [{ data: cats }, { data: countriesData }] = await Promise.all([
            supabase.from("categories").select("id, name, slug, icon_url, sort_order").order("sort_order").order("name"),
            supabase.from("countries").select("id, iso2, name_pl").eq("active", true).order("name_pl"),
          ]);
          if (cats && cats.length > 0) rawCategories = cats as Category[];
          if (countriesData && countriesData.length > 0) rawCountries = countriesData as Country[];
        } catch (e) {
          console.warn("Supabase loadFilters error, fallback to Firestore:", e);
        }
      }

      // Firestore fallback for filters
      if (rawCategories.length === 0) {
        const fireCats = await firestoreService.getCategories();
        rawCategories = fireCats.map((c) => ({
          id: c.id,
          name: c.name_pl || c.name || c.slug,
          slug: c.slug,
          icon_url: c.icon || c.icon_url || null,
          sort_order: c.sort_order || 0,
        }));
      }
      if (rawCountries.length === 0) {
        const fireCountries = await firestoreService.getCountries();
        rawCountries = fireCountries.map((c) => ({
          id: c.id,
          iso2: c.iso2 || (c.id || "PL").toUpperCase(),
          name_pl: c.name_pl || c.name || c.english_name || "Polska",
        }));
      }

      const normalizedCategories = rawCategories.map((c) => {
        if (c.slug === "architektura" && c.icon_url && c.icon_url.includes("architektura-1784144956289.png")) {
          if (!isUsingFirebaseEmulators) {
            supabase.from("categories").update({ icon_url: null }).eq("id", c.id).then();
          }
          return { ...c, icon_url: null };
        }
        return c;
      });
      setAllCategories(normalizedCategories);
      setCountries(rawCountries);
      if (countryIso && rawCountries.length > 0) {
        const country = rawCountries.find((item) => item.iso2.toLowerCase() === countryIso.toLowerCase());
        if (country) setCountryFilter(country.id);
      }
    };
    loadFilters();
  }, [countryIso]);

  useEffect(() => {
    const loadProducts = async () => {
      setIsLoading(true);
      const select =
        "id, title, image_front_url, photo_author, thank_you_text, crop_settings, price_grosze, country_id, category_id, language_code, view_no, countries(id, iso2, name_pl), categories(id, name, slug, icon_url, sort_order)";
      const isPopular = countryFilter === "all" && categoryFilter === "all";

      let fetchedProducts: Product[] = [];

      if (!isUsingFirebaseEmulators) {
        try {
        let query = supabase.from("card_designs").select(select).eq("active", true);

        if (isPopular) {
          try {
            const { data: popularRows } = await (supabase.rpc as unknown as (
              fn: string,
              args: Record<string, unknown>
            ) => Promise<{ data: Array<{ card_design_id: string }> | null }>)("get_popular_card_designs", { _limit: 20 });
            const popularIds = (popularRows || []).map((row) => row.card_design_id);
            if (popularIds.length > 0) {
              const { data } = await query.in("id", popularIds);
              const positions = new Map(popularIds.map((id, index) => [id, index]));
              fetchedProducts = ((data as unknown as Product[]) || []).sort(
                (a, b) => (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0)
              );
            }
          } catch {
            // ignore rpc error
          }

          if (fetchedProducts.length === 0) {
            const { data } = await query.order("created_at", { ascending: false }).limit(20);
            fetchedProducts = (data as unknown as Product[]) || [];
          }
        } else {
          if (countryFilter !== "all") query = query.eq("country_id", countryFilter);
          if (categoryFilter !== "all") query = query.eq("category_id", categoryFilter);
          const { data } = await query.order("created_at", { ascending: false }).limit(100);
          fetchedProducts = (data as unknown as Product[]) || [];
        }
        } catch (e) {
          console.warn("Supabase loadProducts error:", e);
        }
      }

      // If Supabase returned 0 items, fallback to Firestore
      if (fetchedProducts.length === 0) {
        try {
          const [firestoreCards, firestoreCountries, firestoreCats] = await Promise.all([
            firestoreService.getCardDesigns(),
            firestoreService.getCountries(),
            firestoreService.getCategories(),
          ]);

          const countriesMap = new Map(firestoreCountries.map((c) => [c.id, c]));
          const catsMap = new Map(firestoreCats.map((c) => [c.id, c]));

          let filtered = firestoreCards;
          if (countryFilter !== "all") {
            filtered = filtered.filter((c) => c.country_id === countryFilter);
          }
          if (categoryFilter !== "all") {
            filtered = filtered.filter((c) => c.category_id === categoryFilter);
          }

          fetchedProducts = filtered.map((c, index) => {
            const countryDoc = c.country_id ? countriesMap.get(c.country_id) : null;
            const catDoc = c.category_id ? catsMap.get(c.category_id) : null;

            return {
              id: c.id,
              title: c.title || `Podróżówka ${countryDoc?.name || "Polska"}`,
              image_front_url: c.image_front_url || null,
              photo_author: c.photo_author || null,
              thank_you_text: c.thank_you_text || c.description || null,
              crop_settings: c.crop_settings || null,
              price_grosze: c.price_grosze || Math.round((c.price_pln || 4.99) * 100),
              country_id: c.country_id || "PL",
              category_id: c.category_id || null,
              language_code: c.language_code || "pl",
              view_no: c.view_no || index + 1,
              countries: countryDoc
                ? {
                    id: countryDoc.id,
                    iso2: countryDoc.iso2 || (countryDoc.id || "PL").toUpperCase(),
                    name_pl: countryDoc.name_pl || countryDoc.name || countryDoc.english_name || "Polska",
                  }
                : null,
              categories: catDoc
                ? {
                    id: catDoc.id,
                    name: catDoc.name_pl || catDoc.name || catDoc.slug,
                    slug: catDoc.slug,
                    icon_url: catDoc.icon || catDoc.icon_url || null,
                    sort_order: catDoc.sort_order || 0,
                  }
                : null,
            };
          });
        } catch (err) {
          console.error("Firestore loadProducts fallback error:", err);
        }
      }

      setProducts(fetchedProducts);
      setIsLoading(false);
    };
    loadProducts();
  }, [countryFilter, categoryFilter]);

  const visible = products;
  const isPopularView = countryFilter === "all" && categoryFilter === "all";

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
              Wybierz Podróżówkę i zabierz ją w podróż.
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
                      {c.icon_url && !c.icon_url.includes("architektura") ? (
                        <img src={c.icon_url} alt="" className="h-5 w-5 rounded-full object-cover" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                      ) : (() => {
                        const CategoryIcon = getCategoryIcon(c.slug);
                        return <CategoryIcon className="h-4 w-4" aria-hidden="true" />;
                      })()}
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

        {!isLoading && isPopularView && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-2xl font-bold text-foreground">Najczęściej wybierane</h2>
              <p className="mt-1 text-sm text-muted-foreground">20 wzorów wybieranych najchętniej przez Podróżników.</p>
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Top 20</span>
          </div>
        )}

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
                    <div className="aspect-[154/111] overflow-hidden rounded-xl bg-muted shadow-sm">
                      <PostcardFront
                        imageUrl={p.image_front_url}
                        photoAuthor={p.photo_author}
                        contentText={p.thank_you_text}
                        cropSettings={p.crop_settings || undefined}
                        showCropMarks={false}
                        className="h-full w-full transition-transform duration-500 group-hover:scale-[1.02]"
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {p.countries && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground">
                            <img
                              src={`https://flagcdn.com/w40/${p.countries.iso2.toLowerCase()}.png`}
                              alt=""
                              className="h-3.5 w-5 rounded-[2px] object-cover"
                            />
                            {p.countries.name_pl}
                          </span>
                      )}
                      {p.categories && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground">
                            {p.categories.icon_url && !p.categories.icon_url.includes("architektura") ? (
                              <img src={p.categories.icon_url} alt="" className="w-4 h-4 rounded-full object-cover" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                            ) : (() => {
                              const CategoryIcon = getCategoryIcon(p.categories?.slug);
                              return <CategoryIcon className="h-3.5 w-3.5" aria-hidden="true" />;
                            })()}
                            {p.categories.name}
                          </span>
                      )}
                    </div>
                    <h2 className="min-h-12 px-1 pt-4 font-display text-lg font-semibold leading-snug text-foreground line-clamp-2">
                      {productTitle}
                    </h2>
                  </Link>
                  <div className="mt-4 flex items-center justify-between gap-3 px-1 pb-1">
                <p className="shrink-0 whitespace-nowrap font-display text-xl font-bold text-primary">{formatPln(p.price_grosze)}</p>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <div className="flex items-center rounded-lg border border-border bg-background">
                        <button
                          type="button"
                          onClick={() => {
                            setQuantitiesToAdd((current) => ({
                              ...current,
                              [p.id]: Math.max(1, (current[p.id] ?? 1) - 1),
                            }));
                          }}
                          disabled={(quantitiesToAdd[p.id] ?? 1) <= 1}
                          className="min-h-10 min-w-10 rounded-l-lg text-lg text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-35"
                          aria-label={`Usuń jedną sztukę: ${productTitle}`}
                        >
                          −
                        </button>
                        <span className="min-w-7 text-center text-sm font-semibold" aria-live="polite">
                          {quantitiesToAdd[p.id] ?? 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => setQuantitiesToAdd((current) => ({
                            ...current,
                            [p.id]: (current[p.id] ?? 1) + 1,
                          }))}
                          className="min-h-10 min-w-10 rounded-r-lg text-lg text-foreground transition-colors hover:bg-muted"
                          aria-label={`Dodaj jedną sztukę: ${productTitle}`}
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const quantity = quantitiesToAdd[p.id] ?? 1;
                          addItem(p.id, quantity, undefined, {
                            title: getProductTitle(p),
                            image_front_url: p.image_front_url,
                            price_grosze: p.price_grosze,
                            currency: "PLN",
                            country_name: p.countries?.name_pl ?? null,
                          });
                          toast.success(`Dodano ${quantity} szt. do koszyka`);
                          setQuantitiesToAdd((current) => ({ ...current, [p.id]: 1 }));
                        }}
                        className="min-h-10 rounded-lg border border-primary/30 px-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
                      >
                        Dodaj do koszyka
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
