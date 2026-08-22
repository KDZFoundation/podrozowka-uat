import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronRight, Package, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { firestoreService } from "@/integrations/firebase/services/firestoreService";
import { isUsingFirebaseEmulators } from "@/integrations/firebase/config";
import { getCategoryIcon } from "@/lib/categoryIcons";
import { useCart } from "@/contexts/CartContext";
import { getProductTitle } from "@/lib/productTitle";

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
}

interface Product {
  id: string;
  title: string | null;
  description: string | null;
  image_front_url: string | null;
  price_grosze: number;
  country_id: string;
  language_code: string;
  view_no: number;
  active: boolean;
  countries: Country | null;
  categories: Category | null;
}

interface ExtraImage {
  id: string;
  url: string;
  sort_order: number;
}

interface LanguageTemplate {
  language_code: string;
  language_name: string;
  front_thank_you_text: string;
}

const formatPln = (grosze: number) =>
  (grosze / 100).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";

const ShopProduct = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addItem } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [images, setImages] = useState<ExtraImage[]>([]);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [quantityToAdd, setQuantityToAdd] = useState<number>(1);
  const [languageTemplates, setLanguageTemplates] = useState<LanguageTemplate[]>([]);
  const [secondaryLanguageCode, setSecondaryLanguageCode] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setIsLoading(true);
      let foundProduct: Product | null = null;
      let extraImages: ExtraImage[] = [];

      if (!isUsingFirebaseEmulators) {
        try {
        const [{ data: p }, { data: imgs }] = await Promise.all([
          supabase
            .from("card_designs")
            .select(
              "id, title, description, image_front_url, price_grosze, country_id, language_code, view_no, active, countries(id, iso2, name_pl), categories(id, name, slug, icon_url)"
            )
            .eq("id", id)
            .maybeSingle(),
          supabase
            .from("card_design_images")
            .select("id, url, sort_order")
            .eq("card_design_id", id)
            .order("sort_order", { ascending: true }),
        ]);

        if (p) {
          foundProduct = p as unknown as Product;
        }
        if (imgs) {
          extraImages = (imgs as ExtraImage[]) || [];
        }
        } catch (e) {
          console.warn("Supabase load product error:", e);
        }
      }

      // Firestore fallback if not in Supabase
      if (!foundProduct) {
        try {
          const [cardDoc, countriesList, catsList] = await Promise.all([
            firestoreService.getCardDesignById(id),
            firestoreService.getCountries(),
            firestoreService.getCategories(),
          ]);

          if (cardDoc) {
            const countryDoc = cardDoc.country_id ? countriesList.find((c) => c.id === cardDoc.country_id) : null;
            const catDoc = cardDoc.category_id ? catsList.find((c) => c.id === cardDoc.category_id) : null;

            foundProduct = {
              id: cardDoc.id,
              title: cardDoc.title || `Podróżówka ${countryDoc?.name || "Polska"}`,
              description: cardDoc.description || null,
              image_front_url: cardDoc.image_front_url || null,
              price_grosze: cardDoc.price_grosze || Math.round((cardDoc.price_pln || 4.99) * 100),
              country_id: cardDoc.country_id || "PL",
              language_code: cardDoc.language_code || "pl",
              view_no: cardDoc.view_no || 1,
              active: cardDoc.active,
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
                  }
                : null,
            };
          }
        } catch (err) {
          console.error("Firestore getCardDesignById error:", err);
        }
      }

      if (!foundProduct) {
        toast.error("Produkt niedostępny");
        navigate("/sklep", { replace: true });
        return;
      }

      setProduct(foundProduct);

      if (isUsingFirebaseEmulators) {
        const templates = await firestoreService.getLanguageTemplatesForCountry(foundProduct.country_id);
        setLanguageTemplates(
          templates
            .filter((template) => template.language_code !== foundProduct.language_code)
            .map((template) => ({
              language_code: template.language_code,
              language_name: template.language_name,
              front_thank_you_text: template.front_thank_you_text,
            }))
        );
      } else {
        try {
          const { data: templates } = await supabase
            .from("card_language_templates")
            .select("language_code, language_name, front_thank_you_text")
            .eq("country_id", foundProduct.country_id)
            .neq("language_code", foundProduct.language_code)
            .order("language_name");
          setLanguageTemplates((templates as LanguageTemplate[] | null) || []);
        } catch {
          setLanguageTemplates([]);
        }
      }

      setImages(extraImages);
      setActiveImage(foundProduct.image_front_url || (extraImages[0]?.url) || null);
      setIsLoading(false);
    };
    load();
  }, [id, navigate]);

  useEffect(() => {
    if (product) {
      document.title = `${getProductTitle(product)} – Sklep – Podróżówka`;
      const meta = document.querySelector('meta[name="description"]');
      if (meta && product.description) {
        meta.setAttribute("content", product.description.slice(0, 155));
      }
    }
  }, [product]);

  const gallery = useMemo(() => {
    const list: string[] = [];
    if (product?.image_front_url) list.push(product.image_front_url);
    images.forEach((i) => {
      if (!list.includes(i.url)) list.push(i.url);
    });
    return list;
  }, [product, images]);

  const handleAddToCart = () => {
    if (!product) return;
    const quantity = Math.max(1, Math.floor(quantityToAdd) || 1);
    const secondaryLanguage = languageTemplates.find((template) => template.language_code === secondaryLanguageCode);
    addItem(product.id, quantity, undefined, {
      title: getProductTitle(product),
      image_front_url: product.image_front_url,
      price_grosze: product.price_grosze,
      currency: "PLN",
      country_name: product.countries?.name_pl ?? null,
    }, secondaryLanguage ? {
      code: secondaryLanguage.language_code,
      name: secondaryLanguage.language_name,
      front_text: secondaryLanguage.front_thank_you_text,
    } : undefined);
    const noun = quantity === 1 ? "pocztówkę" : quantity >= 2 && quantity <= 4 ? "pocztówki" : "pocztówek";
    toast.success(`Dodano ${quantity} ${noun} do koszyka`);
  };

  if (isLoading || !product) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <main id="main-content" className="container mx-auto flex-1 px-4 pb-8 pt-24 md:pt-28">
          <div className="grid md:grid-cols-2 gap-8 animate-pulse">
            <div className="aspect-[3/2] bg-muted rounded-xl" />
            <div className="space-y-4">
              <div className="h-8 bg-muted rounded w-3/4" />
              <div className="h-4 bg-muted rounded w-1/3" />
              <div className="h-10 bg-muted rounded w-1/4" />
              <div className="h-24 bg-muted rounded" />
              <div className="h-12 bg-muted rounded w-1/2" />
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main id="main-content" className="container mx-auto flex-1 px-4 pb-10 pt-24 md:pb-14 md:pt-28">
        <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-6">
          <Link to="/sklep" className="hover:text-foreground">
            Sklep
          </Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-foreground truncate">{getProductTitle(product)}</span>
        </nav>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-3">
            <div className="aspect-[3/2] bg-muted rounded-xl overflow-hidden">
              {activeImage ? (
                <img src={activeImage} alt={getProductTitle(product)} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="w-12 h-12 text-muted-foreground" />
                </div>
              )}
            </div>
            {gallery.length > 1 && (
              <div className="grid grid-cols-5 gap-2">
                {gallery.map((url) => (
                  <button
                    key={url}
                    onClick={() => setActiveImage(url)}
                    className={`aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                      activeImage === url ? "border-primary" : "border-transparent hover:border-border"
                    }`}
                    aria-label="Pokaż zdjęcie"
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {product.countries && (
                <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                  {product.countries.name_pl}
                </span>
              )}
              {product.categories && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-card border border-border text-foreground">
                  {product.categories.icon_url && !product.categories.icon_url.includes("architektura") ? (
                    <img src={product.categories.icon_url} alt="" className="w-4 h-4 rounded-full object-cover" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                  ) : (() => {
                    const CategoryIcon = getCategoryIcon(product.categories?.slug);
                    return <CategoryIcon className="h-4 w-4" aria-hidden="true" />;
                  })()}
                  {product.categories.name}
                </span>
              )}
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">{getProductTitle(product)}</h1>
            <p className="font-display text-3xl font-bold text-primary mb-6">{formatPln(product.price_grosze)}</p>

            <div className="mb-6">
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-800 dark:text-amber-200">
                📌 <strong>Uwaga:</strong> możesz łączyć różne wzory. Minimalne zamówienie to <strong>10 podróżówek</strong> w całym koszyku.
              </div>
            </div>

            {product.description && (
              <div className="prose prose-sm max-w-none mb-6">
                <p className="text-foreground whitespace-pre-line leading-relaxed">{product.description}</p>
              </div>
            )}

            {languageTemplates.length > 0 && (
              <div className="mb-5 rounded-xl border border-border bg-muted/30 p-4">
                <label htmlFor="secondary-language" className="block text-sm font-semibold text-foreground">
                  Dodatkowy język na przodzie kartki <span className="font-normal text-muted-foreground">(opcjonalnie)</span>
                </label>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Podziękowanie zostanie wydrukowane w dwóch językach, rozdzielonych ukośnikiem. Tył z kodem QR pozostanie w języku podstawowym wzoru.
                </p>
                <select
                  id="secondary-language"
                  value={secondaryLanguageCode}
                  onChange={(event) => setSecondaryLanguageCode(event.target.value)}
                  className="mt-3 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Bez dodatkowego języka</option>
                  {languageTemplates.map((template) => (
                    <option key={template.language_code} value={template.language_code}>
                      {template.language_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="mb-5">
              <label htmlFor="postcard-quantity" className="mb-2 block text-sm font-medium text-foreground">
                Liczba podróżówek tego wzoru
              </label>
              <div className="flex w-fit items-center overflow-hidden rounded-lg border border-border bg-card">
                <button
                  type="button"
                  onClick={() => setQuantityToAdd((quantity) => Math.max(1, quantity - 1))}
                  className="px-3 py-2 text-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Zmniejsz liczbę podróżówek"
                >
                  −
                </button>
                <input
                  id="postcard-quantity"
                  type="number"
                  min={1}
                  max={1000}
                  value={quantityToAdd}
                  onChange={(event) => {
                    const value = Number.parseInt(event.target.value, 10);
                    setQuantityToAdd(Number.isFinite(value) ? Math.max(1, value) : 1);
                  }}
                  className="w-14 border-x border-border bg-background py-2 text-center text-sm font-semibold outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setQuantityToAdd((quantity) => quantity + 1)}
                  className="px-3 py-2 text-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Zwiększ liczbę podróżówek"
                >
                  +
                </button>
              </div>
            </div>

            <Button size="lg" onClick={handleAddToCart} className="w-full md:w-auto font-medium">
              <ShoppingCart className="w-4 h-4 mr-2" />
              Dodaj do koszyka ({quantityToAdd} szt.)
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ShopProduct;
