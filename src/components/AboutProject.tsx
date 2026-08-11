import { ArrowRight, Camera, Gift, Map, QrCode, Sparkles, Trophy, Users } from "lucide-react";
import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

const chapters = [
  {
    icon: Gift,
    title: "Idea",
    text: "Odwrócona pocztówka jedzie z podróżnikiem, a nie do jego domu. Jest fizycznym podziękowaniem dla osoby spotkanej po drodze.",
  },
  {
    icon: Users,
    title: "Relacja",
    text: "Kartka trafia do konkretnej osoby. Kod QR pozwala obdarowanemu zostawić ślad i połączyć kartkę z historią podróży.",
  },
  {
    icon: Trophy,
    title: "Gra społecznościowa",
    text: "Rangi i misje pokazują realną aktywność ambasadora: liczbę gestów, krajów i rozpoczętych relacji, a nie popularność.",
  },
  {
    icon: Map,
    title: "Wpływ kulturowy",
    text: "Każda kartka promuje polską fotografię, krajobraz lub sztukę poza Polską i prowadzi do prawdziwego kontaktu między ludźmi.",
  },
];

const loop = [
  { icon: Camera, label: "Polska fotografia" },
  { icon: Gift, label: "Kartka" },
  { icon: Users, label: "Podróżnik" },
  { icon: QrCode, label: "Obdarowany + QR" },
  { icon: Sparkles, label: "Historia i wpływ" },
];

const AboutProject = () => {
  useEffect(() => trackEvent("landing_about_view"), []);
  return (
  <section id="zasady-gry" className="bg-secondary/35 py-20 md:py-28">
    <div className="container mx-auto px-4">
      <div className="mx-auto max-w-3xl text-center">
        <span className="mb-4 inline-flex rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">Jak działa projekt</span>
        <h2 className="font-display text-3xl font-bold leading-tight text-foreground md:text-5xl">Jedna kartka. Jedno spotkanie. Cała historia.</h2>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">Podróżówka łączy polską kulturę z osobistym gestem podróżnika. Obdarowany nie jest odbiorcą reklamy — staje się uczestnikiem wspólnej historii.</p>
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {chapters.map(({ icon: Icon, title, text }) => (
          <article key={title} className="rounded-2xl border border-border/70 bg-card p-6 shadow-soft">
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
            <h3 className="font-display text-xl font-semibold text-foreground">{title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{text}</p>
          </article>
        ))}
      </div>

      <div className="mt-12 rounded-3xl bg-card p-6 shadow-card md:p-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div><p className="text-sm font-semibold uppercase tracking-widest text-primary">Pętla Podróżówki</p><h3 className="mt-2 font-display text-2xl font-bold text-foreground md:text-3xl">Od polskiego obrazu do międzynarodowej relacji</h3></div>
          <a href="/#gra" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">Zobacz mechanizm gry <ArrowRight className="h-4 w-4" /></a>
        </div>
        <div className="mt-10 grid gap-6 sm:grid-cols-5">
          {loop.map(({ icon: Icon, label }, index) => (
            <div key={label} className="relative flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground"><Icon className="h-6 w-6" /></div>
              <p className="mt-3 text-sm font-semibold text-foreground">{label}</p>
              {index < loop.length - 1 && <div className="absolute left-[calc(50%+2.5rem)] top-7 hidden h-px w-[calc(100%-1rem)] bg-primary/25 sm:block" aria-hidden="true" />}
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-primary/20 bg-primary/5 p-6 text-center md:p-8">
        <h3 className="font-display text-2xl font-bold text-foreground">Przykład jednej kartki</h3>
        <p className="mt-3 leading-relaxed text-muted-foreground">Podróżnik wybiera polski wzór, wręcza go gospodarzowi w Tajlandii, a gospodarz skanuje QR i wpisuje krótką wiadomość. W panelu podróżnika pojawia się nowa relacja, postęp misji i kolejny ślad promocji Polski.</p>
      </div>
    </div>
  </section>
  );
};

export default AboutProject;
