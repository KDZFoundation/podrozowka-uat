import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { firestoreService } from "@/integrations/firebase/services/firestoreService";

interface CountryCategory {
  id: string;
  iso2: string;
  name: string;
  thankYou: string;
  available: number;
  sold: number;
}

const DEFAULT_FEATURED_COUNTRIES = ["DE", "IT", "ES", "GB", "FR", "UA", "TH", "IN", "TR", "US", "CZ", "HR", "GR", "HU", "CN", "NO"];

const CountryCategories = () => {
  const [categories, setCategories] = useState<CountryCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadCommunityShop = async () => {
      setIsLoading(true);
      try {
        const [fireCountries, fireDesigns, fireTemplates] = await Promise.all([
          firestoreService.getCountries(),
          firestoreService.getCardDesigns(),
          firestoreService.getLanguageTemplates(),
        ]);
        const designCounts = new Map<string, number>();
        const thankYouByCountry = new Map<string, string>();

        fireDesigns.forEach((design) => {
          if (!design.country_id) return;
          designCounts.set(design.country_id, (designCounts.get(design.country_id) || 0) + 1);
          if (design.thank_you_text && !thankYouByCountry.has(design.country_id)) {
            thankYouByCountry.set(design.country_id, design.thank_you_text);
          }
        });
        fireTemplates.forEach((template) => {
          if (template.country_id && !thankYouByCountry.has(template.country_id)) {
            thankYouByCountry.set(template.country_id, template.front_thank_you_text);
          }
        });
        const featured = new Set(DEFAULT_FEATURED_COUNTRIES);
        setCategories(
          fireCountries
            .filter((country) => featured.has(country.iso2 || "") || (designCounts.get(country.id) || 0) > 0)
            .map((country) => ({
              id: country.id,
              iso2: country.iso2 || country.id,
              name: country.name_pl || country.name,
              thankYou: thankYouByCountry.get(country.id) || "Dziękuję",
              available: designCounts.get(country.id) || 0,
              sold: 0,
            }))
            .sort((a, b) => b.available - a.available || a.name.localeCompare(b.name, "pl")),
        );
      } catch (error) {
        console.warn("Firestore community shop error:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadCommunityShop();
  }, []);

  const maxSold = Math.max(1, ...categories.map((country) => country.sold));

  return (
    <section id="community-shop" className="bg-background py-20 md:py-28">
      <div className="container mx-auto px-4">
        <div className="mb-10 text-center">
          <span className="mb-4 inline-block rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">Sklep Podróżówka</span>
          <h2 className="mb-4 font-display text-3xl font-bold text-foreground md:text-5xl">Wybierz język podziękowania</h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Każda Podróżówka zawiera piękne zdjęcie Polski i podziękowania w wybranym języku. Idealna pamiątka dla osób, które spotkasz w podróży.
          </p>
        </div>

        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground">Wczytywanie wzorów…</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
            {categories.map((country, index) => (
              <Link
                key={country.id}
                to={`/sklep?country_iso=${country.iso2}`}
                className="block text-left transition-transform duration-300 hover:-translate-y-1"
              >
                <motion.article
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  viewport={{ once: true }}
                  className="group flex h-full flex-col justify-between rounded-xl border border-transparent bg-card p-5 shadow-soft transition-all duration-300 hover:border-primary/20 hover:shadow-card"
                >
                  <div>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <img
                        src={`https://flagcdn.com/w80/${country.iso2.toLowerCase()}.png`}
                        alt={`Flaga: ${country.name}`}
                        className="h-5 w-8 rounded border border-border object-cover shadow-2xs"
                      />
                      <span className="rounded-full bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
                        {country.available} {country.available === 1 ? "wzór" : "wzorów"}
                      </span>
                    </div>
                    <h3 className="mb-3 font-display text-lg font-bold text-foreground">{country.name}</h3>
                    <div className="rounded-lg bg-secondary px-2 py-2">
                      <p className="mb-0.5 text-xs text-muted-foreground">Podziękowanie:</p>
                      <p className="truncate font-display text-sm font-medium text-foreground">{country.thankYou}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-500"
                        style={{ width: `${Math.max(3, Math.round((country.sold / maxSold) * 100))}%` }}
                        aria-hidden="true"
                      />
                    </div>
                    <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
                      {country.sold.toLocaleString("pl-PL")} sprzedanych
                    </span>
                  </div>
                  <span className="mt-4 inline-flex text-sm font-semibold text-primary">Zobacz wzory w sklepie →</span>
                </motion.article>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-12 text-center">
          <Link
            to="/sklep"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-8 py-4 font-semibold text-primary-foreground shadow-soft transition-all hover:bg-primary/90 hover:shadow-card"
          >
            Przejdź do sklepu
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">Łącz różne wzory w jednym zamówieniu — minimum 10 sztuk.</p>
        </div>
      </div>
    </section>
  );
};

export default CountryCategories;
