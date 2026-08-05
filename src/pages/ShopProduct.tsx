import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronRight, Package, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
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
}

interface Product {
  id: string;
  title: string | null;
  description: string | null;
  image_front_url: string | null;
  price_grosze: number;
  country_id: string;
  active: boolean;
  countries: Country | null;
  categories: Category | null;
}

interface ExtraImage {
  id: string;
  url: string;
  sort_order: number;
}

const formatPln = (grosze: number) =>
  (grosze / 100).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";

const ShopProduct = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addItem, getQuantity } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [images, setImages] = useState<ExtraImage[]>([]);
  const [stock, setStock] = useState<number>(0);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setIsLoading(true);
      const [{ data: p }, { data: imgs }, { data: stockData }] = await Promise.all([
        supabase
          .from("card_designs")
          .select("id, title, description, image_front_url, price_grosze, country_id, active, countries!inner(id, iso2, name_pl), categories(id, name, slug, icon_url)")
          .eq("id", id)
          .eq("active", true)
          .gt("price_grosze", 0)
          .maybeSingle(),
        supabase
          .from("card_design_images")
          .select("id, url, sort_order")
          .eq("card_design_id", id)
          .order("sort_order", { ascending: true }),
        supabase.rpc("get_product_stock", { _id: id }),
      ]);

      if (!p) {
        toast.error("Produkt niedostępny");
        navigate("/sklep", { replace: true });
        return;
      }
      setProduct(p as unknown as Product);
      setImages((imgs as ExtraImage[]) || []);
      setStock((stockData as number) || 0);
      setActiveImage((p as unknown as Product).image_front_url || (imgs && imgs[0]?.url) || null);
      setIsLoading(false);
    };
    load();
  }, [id, navigate]);

  useEffect(() => {
    if (product) {
      document.title = `${product.title || "Produkt"} – Sklep – Podróżówka`;
      const meta = document.querySelector('meta[name="description"]');
      if (meta && product.description) {
        meta.setAttribute("content", product.description.slice(0, 155));
      }
    }
  }, [product]);

  const [quantityToAdd, setQuantityToAdd] = useState<number>(10);

  useEffect(() => {
    if (stock > 0) {
      setQuantityToAdd(Math.min(10, stock));
    }
  }, [stock]);

  const gallery = useMemo(() => {
    const list: string[] = [];
    if (product?.image_front_url) list.push(product.image_front_url);
    images.forEach((i) => {
      if (!list.includes(i.url)) list.push(i.url);
    });
    return list;
  }, [product, images]);

  const inCart = product ? getQuantity(product.id) : 0;
  const canAdd = stock > 0 && inCart < stock;

  const handleAddToCart = () => {
    if (!product) return;
    if (stock === 0) {
      toast.error("Produkt niedostępny");
      return;
    }
    const toAdd = Math.max(1, quantityToAdd);
    if (inCart + toAdd > stock) {
      toast.error(`Nie można dodać ${toAdd} szt. — w magazynie zostało ${stock - inCart} szt.`);
      return;
    }
    addItem(product.id, toAdd, stock);
    toast.success(`Dodano ${toAdd} szt. do koszyka`);
  };

  if (isLoading || !product) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8">
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
      <main className="flex-1 container mx-auto px-4 py-8">
        <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-6">
          <Link to="/sklep" className="hover:text-foreground">
            Sklep
          </Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-foreground truncate">{product.title}</span>
        </nav>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-3">
            <div className="aspect-[3/2] bg-muted rounded-xl overflow-hidden">
              {activeImage ? (
                <img src={activeImage} alt={product.title || ""} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
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
                  {product.categories.icon_url && (
                    <img src={product.categories.icon_url} alt="" className="w-4 h-4 rounded-full object-cover" referrerPolicy="no-referrer" />
                  )}
                  {product.categories.name}
                </span>
              )}
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">{product.title}</h1>
            <p className="font-display text-3xl font-bold text-primary mb-6">{formatPln(product.price_grosze)}</p>

            <div className="mb-6 space-y-2">
              {stock > 0 ? (
                <p className="text-sm text-accent font-medium">
                  <span className="inline-block w-2 h-2 rounded-full bg-accent mr-2" />
                  Dostępne w magazynie: {stock} szt.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground mr-2" />
                  Niedostępne
                </p>
              )}
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-800 dark:text-amber-200">
                📌 <strong>Uwaga:</strong> Minimalne zamówienie to <strong>10 podróżówek</strong> w koszyku.
              </div>
            </div>

            {product.description && (
              <div className="prose prose-sm max-w-none mb-6">
                <p className="text-foreground whitespace-pre-line leading-relaxed">{product.description}</p>
              </div>
            )}

            {canAdd && (
              <div className="mb-6 space-y-2">
                <label className="text-xs font-medium text-muted-foreground block">Liczba sztuk do dodania:</label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center border border-border rounded-lg bg-card">
                    <button
                      type="button"
                      onClick={() => setQuantityToAdd((q) => Math.max(1, q - 1))}
                      className="px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-l-lg transition-colors font-bold"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={stock}
                      value={quantityToAdd}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) setQuantityToAdd(Math.min(stock, Math.max(1, val)));
                      }}
                      className="w-16 text-center font-bold bg-transparent border-0 focus:outline-none text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setQuantityToAdd((q) => Math.min(stock, q + 1))}
                      className="px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-r-lg transition-colors font-bold"
                    >
                      +
                    </button>
                  </div>
                  <div className="flex gap-1">
                    {[10, 20, 50].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setQuantityToAdd(Math.min(stock, num))}
                        className={`px-2.5 py-1.5 rounded text-xs font-medium border transition-colors ${
                          quantityToAdd === num
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/50 border-border hover:bg-muted text-foreground"
                        }`}
                      >
                        {num} szt.
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <Button size="lg" onClick={handleAddToCart} disabled={!canAdd} className="w-full md:w-auto font-medium">
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
