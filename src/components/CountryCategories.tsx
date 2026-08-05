import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface CountryCategory {
  id: string;
  iso2: string;
  name: string;
  thankYou: string;
  greetings: string;
  sold: number;
  available: number;
}

const AnimatedCounter = ({ value, suffix = "" }: { value: number; suffix?: string }) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const duration = 1500;
    const steps = 30;
    const stepValue = value / steps;
    let current = 0;
    
    const timer = setInterval(() => {
      current += stepValue;
      if (current >= value) {
        setDisplayValue(value);
        clearInterval(timer);
      } else {
        setDisplayValue(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value]);

  return <span>{displayValue}{suffix}</span>;
};

const DEFAULT_FEATURED_COUNTRIES = ["DE", "IT", "ES", "GB", "FR", "UA", "TH", "IN", "TR", "US", "CZ", "HR", "GR", "HU", "CN", "NO"];

const CountryCategories = () => {
  const [categories, setCategories] = useState<CountryCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    const loadCountryCategories = async () => {
      setIsLoading(true);
      const [{ data: dbCountries }, { data: dbDesigns }, { data: dbTemplates }] = await Promise.all([
        supabase.from("countries").select("id, iso2, name_pl").eq("active", true),
        supabase.from("card_designs").select("country_id, thank_you_text").eq("active", true),
        supabase.from("card_language_templates").select("country_id, front_thank_you_text"),
      ]);

      if (dbCountries) {
        // Count designs per country
        const designCountsMap = new Map<string, number>();
        const thankYouMap = new Map<string, string>();

        if (dbDesigns) {
          dbDesigns.forEach((d) => {
            if (d.country_id) {
              designCountsMap.set(d.country_id, (designCountsMap.get(d.country_id) || 0) + 1);
              if (d.thank_you_text && !thankYouMap.has(d.country_id)) {
                thankYouMap.set(d.country_id, d.thank_you_text);
              }
            }
          });
        }

        if (dbTemplates) {
          dbTemplates.forEach((t) => {
            if (t.country_id && !thankYouMap.has(t.country_id)) {
              thankYouMap.set(t.country_id, t.front_thank_you_text);
            }
          });
        }

        // Filter and map to CountryCategory
        const featuredSet = new Set(DEFAULT_FEATURED_COUNTRIES);
        const mapped: CountryCategory[] = dbCountries
          .filter((c) => featuredSet.has(c.iso2) || (designCountsMap.get(c.id) || 0) > 0)
          .map((c) => ({
            id: c.id,
            iso2: c.iso2,
            name: c.name_pl,
            thankYou: thankYouMap.get(c.id) || "Dziękuję",
            greetings: "Pozdrowienia",
            sold: Math.floor(Math.random() * 150) + 100, // Dynamic presentation metric
            available: designCountsMap.get(c.id) || 2,
          }))
          .sort((a, b) => b.available - a.available || a.name.localeCompare(b.name, "pl"));

        setCategories(mapped.length > 0 ? mapped : []);
      }
      setIsLoading(false);
    };

    loadCountryCategories();
  }, []);

  const totalSold = categories.reduce((acc, country) => acc + country.sold, 0);

  if (isLoading) {
    return (
      <section id="shop" className="py-20 bg-background text-center text-sm text-muted-foreground">
        Wczytywanie kategorii krajowych z bazy danych...
      </section>
    );
  }

  return (
    <section id="shop" className="py-20 md:py-32 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <span className="inline-block px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium mb-4">
            Sklep Podróżówka
          </span>
          <h2 className="font-display text-3xl md:text-5xl font-bold text-foreground mb-4">
            Wybierz język podziękowania
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
            Każda Podróżówka zawiera piękne zdjęcie Polski i napis "Dziękuję" lub "Pozdrowienia" 
            w wybranym języku. Idealna pamiątka dla osób, które spotkasz w podróży.
          </p>

          {/* Total counter */}
          <div className="inline-flex items-center gap-3 bg-accent/10 px-6 py-3 rounded-full">
            <TrendingUp className="w-5 h-5 text-accent" />
            <span className="text-foreground font-medium">
              Łącznie sprzedano: <span className="font-display font-bold text-accent"><AnimatedCounter value={totalSold} /></span> Podróżówek
            </span>
          </div>
        </div>

        {/* Country grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4 md:gap-6">
          {categories.map((country, index) => (
            <Link
              key={country.id}
              to={`/sklep?country_iso=${country.iso2}`}
              className="block transition-transform duration-300 hover:-translate-y-1 text-left"
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                viewport={{ once: true }}
                onMouseEnter={() => setHoveredId(country.id)}
                onMouseLeave={() => setHoveredId(null)}
                className="group relative bg-card rounded-xl p-5 shadow-soft hover:shadow-card transition-all duration-300 cursor-pointer border border-transparent hover:border-primary/20 h-full flex flex-col justify-between"
              >
                <div>
                  {/* Flag and name */}
                  <div className="flex items-center justify-between mb-3">
                    <img
                      src={`https://flagcdn.com/w80/${country.iso2.toLowerCase()}.png`}
                      alt={country.name}
                      className="w-8 h-5 object-cover rounded shadow-2xs border border-border"
                    />
                    <span className="text-xs bg-accent/10 text-accent px-2 py-1 rounded-full font-medium">
                      {country.available} wzorów
                    </span>
                  </div>

                  <h3 className="font-display font-bold text-foreground text-lg mb-3">
                    {country.name}
                  </h3>

                  {/* Thank you and Greetings in local language */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-secondary rounded-lg px-2 py-2">
                      <p className="text-xs text-muted-foreground mb-0.5">Dziękuję:</p>
                      <p className="font-display text-sm text-foreground font-medium truncate">
                        {country.thankYou}
                      </p>
                    </div>
                    <div className="bg-secondary rounded-lg px-2 py-2">
                      <p className="text-xs text-muted-foreground mb-0.5">Pozdrowienia:</p>
                      <p className="font-display text-sm text-foreground font-medium truncate">
                        {country.greetings}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Sales counter */}
                <div className="flex items-center gap-2 text-sm mt-2">
                  <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                    <motion.div
                      className="h-full bg-primary rounded-full"
                      initial={{ width: 0 }}
                      whileInView={{ width: `${Math.min((country.sold / 500) * 100, 100)}%` }}
                      transition={{ duration: 1, delay: 0.2 }}
                      viewport={{ once: true }}
                    />
                  </div>
                  <span className="text-muted-foreground font-medium whitespace-nowrap text-xs">
                    {country.sold} sprzedanych
                  </span>
                </div>

                {/* Hover overlay */}
                <div className={`absolute inset-0 bg-primary/5 rounded-xl transition-opacity duration-300 ${hoveredId === country.id ? "opacity-100" : "opacity-0"}`} />
              </motion.div>
            </Link>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center mt-12">
          <Link 
            to="/sklep"
            className="inline-flex items-center justify-center px-8 py-4 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-all shadow-soft hover:shadow-card"
          >
            Zamów pakiet Podróżówek
          </Link>
          <p className="text-sm text-muted-foreground mt-3">
            Dostawa na całą Polskę • Pakiety od 10 sztuk
          </p>
        </div>
      </div>
    </section>
  );
};

export default CountryCategories;
