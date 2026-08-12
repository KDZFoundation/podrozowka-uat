import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Globe2, HeartHandshake, QrCode, Sparkles, Trophy } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PlatformStats from "@/components/PlatformStats";
import UserRanking from "@/components/UserRanking";
import CommunityGallery from "@/components/CommunityGallery";
import CountryCategories from "@/components/CountryCategories";

const CommunityIntro = () => (
  <section className="overflow-hidden bg-secondary py-14 md:py-20">
    <div className="container mx-auto grid gap-10 px-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
      <div>
        <span className="mb-5 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
          <HeartHandshake className="h-4 w-4" /> Społeczność Podróżówka
        </span>
        <h1 className="max-w-3xl font-display text-4xl font-bold leading-tight text-foreground md:text-6xl">
          Każda kartka może rozpocząć nową podróż.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
          Podróżówka łączy osoby, które pokazują Polskę światu. Wybierasz wzór i język odbiorcy, wręczasz kartkę,
          a obdarowany skanuje kod QR i dołącza ją do Twojej historii podróży.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Link
            to="/sklep"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-soft transition-colors hover:bg-primary/90"
          >
            Wybierz Podróżówki <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#ranking"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-6 py-3 font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Zobacz ranking <Trophy className="h-4 w-4" />
          </a>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
        {[
          { icon: QrCode, title: "1. Wręcz", text: "Kup kartki i przekaż je osobom spotkanym w podróży." },
          { icon: CheckCircle2, title: "2. Połącz", text: "Obdarowany skanuje QR i potwierdza wspólne spotkanie." },
          { icon: Globe2, title: "3. Wpływaj", text: "Zdobywasz punkty, rangi i promujesz Polskę na świecie." },
        ].map(({ icon: Icon, title, text }) => (
          <article key={title} className="rounded-2xl border border-border/70 bg-background p-5 shadow-soft">
            <Icon className="mb-3 h-6 w-6 text-primary" aria-hidden="true" />
            <h2 className="font-display text-xl font-bold text-foreground">{title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
          </article>
        ))}
      </div>
    </div>
  </section>
);

const ImpactExplainer = () => (
  <section className="bg-background py-14 md:py-20">
    <div className="container mx-auto px-4">
      <div className="mx-auto max-w-3xl text-center">
        <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-[hsl(var(--gold))]/10 px-3 py-1 text-sm font-semibold text-[hsl(var(--gold))]">
          <Sparkles className="h-4 w-4" /> Wpływ kulturowy
        </span>
        <h2 className="font-display text-3xl font-bold text-foreground md:text-5xl">Podróż nie kończy się na wręczeniu kartki</h2>
        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
          Punkty otrzymujesz za zakupione Podróżówki, kolejne kraje oraz rejestracje dokonane przez obdarowanych.
          Rejestracja oznacza, że kartka dotarła do uczestnika Twojej podróży.
        </p>
      </div>
      <div className="mx-auto mt-10 grid max-w-5xl gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-6 text-center shadow-soft">
          <p className="font-display text-2xl font-bold text-primary">Rangi</p>
          <p className="mt-2 text-sm text-muted-foreground">Od Zwiadowcy do Legendy Podróżówki.</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 text-center shadow-soft">
          <p className="font-display text-2xl font-bold text-primary">Kraje</p>
          <p className="mt-2 text-sm text-muted-foreground">Odkrywaj kolejne języki i społeczności.</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 text-center shadow-soft">
          <p className="font-display text-2xl font-bold text-primary">Relacje</p>
          <p className="mt-2 text-sm text-muted-foreground">Buduj historię spotkań, które łączą ludzi.</p>
        </div>
      </div>
    </div>
  </section>
);

const Community = () => (
  <div className="min-h-screen bg-background">
    <Header />
    <main id="main-content" className="pt-16 md:pt-20">
      <CommunityIntro />
      <PlatformStats />
      <CountryCategories />
      <ImpactExplainer />
      <div id="ranking"><UserRanking /></div>
      <CommunityGallery />
    </main>
    <Footer />
  </div>
);

export default Community;
