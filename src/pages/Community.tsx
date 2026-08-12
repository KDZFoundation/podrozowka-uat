import { BookOpenCheck, Flag, HeartHandshake, Route, Sparkles, Trophy } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PlatformStats from "@/components/PlatformStats";
import UserRanking from "@/components/UserRanking";
import CommunityGallery from "@/components/CommunityGallery";
import CountryCategories from "@/components/CountryCategories";

const ImpactExplainer = () => (
  <section className="bg-background py-14 md:py-20">
    <div className="container mx-auto px-4">
      <div className="mx-auto max-w-3xl text-center">
        <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-[hsl(var(--gold))]/10 px-3 py-1 text-sm font-semibold text-[hsl(var(--gold))]">
          <Sparkles className="h-4 w-4" /> Wpływ kulturowy
        </span>
        <h2 className="font-display text-3xl font-bold text-foreground md:text-5xl">Podróż, która łączy ludzi</h2>
        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
          Każda zarejestrowana Podróżówka wzmacnia Twoją historię podróży i pomaga promować Polskę poza jej granicami.
        </p>
      </div>
      <div className="mx-auto mt-10 grid max-w-6xl gap-5 lg:grid-cols-3">
        <article className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-center gap-3"><Trophy className="h-6 w-6 text-[hsl(var(--gold))]" /><h3 className="font-display text-2xl font-bold text-foreground">Poziomy rang</h3></div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Zdobywaj punkty za Podróżówki, nowe kraje i rejestracje obdarowanych.</p>
          <div className="mt-6 space-y-3">
            {[
              ["Zwiadowca", "0 pkt", "w-[7%]"],
              ["Odkrywca", "500 pkt", "w-[18%]"],
              ["Ambasador", "1500 pkt", "w-[36%]"],
              ["Misjonarz Kultury", "3000 pkt", "w-[58%]"],
              ["Legenda Podróżówki", "7500 pkt", "w-full"],
            ].map(([rank, points, width]) => (
              <div key={rank}>
                <div className="mb-1 flex justify-between gap-2 text-xs"><span className="font-semibold text-foreground">{rank}</span><span className="text-muted-foreground">{points}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full bg-primary ${width}`} /></div>
              </div>
            ))}
          </div>
        </article>
        <article className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-center gap-3"><Flag className="h-6 w-6 text-primary" /><h3 className="font-display text-2xl font-bold text-foreground">Misje kulturowe</h3></div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">To cele, które zachęcają do świadomego odkrywania nowych miejsc i budowania relacji.</p>
          <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-2"><BookOpenCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Odkryj kolejny kraj lub język.</li>
            <li className="flex gap-2"><BookOpenCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Przekaż Podróżówkę w wyjątkowym spotkaniu.</li>
            <li className="flex gap-2"><BookOpenCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Zdobądź potwierdzenie relacji przez kod QR.</li>
          </ul>
        </article>
        <article className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-center gap-3"><HeartHandshake className="h-6 w-6 text-accent" /><h3 className="font-display text-2xl font-bold text-foreground">Ściana relacji</h3></div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Gdy obdarowany zeskanuje kod QR i zarejestruje kartkę, powstaje potwierdzenie Waszego spotkania.</p>
          <div className="mt-5 rounded-xl bg-secondary p-4 text-sm text-muted-foreground"><Route className="mb-2 h-5 w-5 text-accent" />To właśnie z takich połączeń tworzy się mapa i galeria społeczności.</div>
        </article>
      </div>
    </div>
  </section>
);

const Community = () => (
  <div className="min-h-screen bg-background">
    <Header />
    <main id="main-content" className="pt-16 md:pt-20">
      <PlatformStats />
      <ImpactExplainer />
      <div id="ranking"><UserRanking /></div>
      <CommunityGallery />
      <CountryCategories />
    </main>
    <Footer />
  </div>
);

export default Community;
