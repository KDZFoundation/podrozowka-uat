import { Link } from "react-router-dom";
import { ArrowRight, HandHeart, MapPinned, Plane, QrCode, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

const steps = [
  { icon: MapPinned, number: "01", title: "Wybierasz kierunek", text: "Dobierasz wzory i języki do osób, które możesz spotkać po drodze." },
  { icon: Plane, number: "02", title: "Ruszysz w podróż", text: "Zabierasz Podróżówki ze sobą — gotowe na wyjątkowe spotkania." },
  { icon: HandHeart, number: "03", title: "Wręczasz gest", text: "Dziękujesz osobie spotkanej w podróży i przekazujesz jej cząstkę Polski." },
  { icon: QrCode, number: "04", title: "Łączy Was QR", text: "Obdarowany rejestruje kartkę, a relacja zasila Twoją historię i wpływ kulturowy." },
];

const CommunityLoop = () => {
  useEffect(() => trackEvent("landing_gamification_view"), []);
  return (
  <section id="gra" className="bg-secondary/45 py-20 md:py-28">
    <div className="container mx-auto px-4">
      <div className="mx-auto max-w-3xl text-center">
        <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary"><Sparkles className="h-4 w-4" /> Podróżówka to społeczność</span>
        <h2 className="font-display text-3xl font-bold leading-tight text-foreground md:text-5xl">Jeden gest może rozpocząć całą historię</h2>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">Nie kupujesz zwykłych kartek. Przygotowujesz zestaw podziękowań, które podczas podróży zamieniają się w prawdziwe relacje między ludźmi.</p>
      </div>

      <div className="relative mt-12 grid gap-4 md:grid-cols-4">
        <div className="absolute left-[12%] right-[12%] top-12 hidden border-t-2 border-dashed border-primary/30 md:block" aria-hidden="true" />
        {steps.map((step) => (
            <article key={step.number} className="relative overflow-hidden rounded-2xl border border-border/70 bg-card p-5 shadow-soft transition-transform hover:-translate-y-1">
              <div className="absolute -right-5 -top-6 font-display text-8xl font-bold text-primary/[0.06]" aria-hidden="true">{step.number}</div>
              <div className="mb-5 flex items-center justify-between"><div className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-background bg-primary text-primary-foreground shadow-soft"><step.icon className="h-5 w-5" /></div><span className="text-sm font-bold tracking-widest text-primary/60">ETAP {step.number}</span></div>
              <h3 className="font-display text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
            </article>
        ))}
      </div>

      <div className="mt-10 grid gap-6 rounded-3xl bg-foreground p-6 text-primary-foreground md:grid-cols-[1fr_auto] md:items-center md:p-9">
        <div><p className="text-sm font-semibold uppercase tracking-widest text-primary">Wpływ Kulturowy</p><h3 className="mt-2 font-display text-2xl font-bold md:text-3xl">Twoja podróż zostawia ślad po drugiej stronie świata.</h3><p className="mt-3 max-w-2xl text-sm leading-relaxed text-primary-foreground/75">Rangi, punkty i Misje Kulturowe pokazują realne gesty: wręczone kartki, poznane osoby i kraje, do których dotarła opowieść o Polsce.</p></div>
        <Link to="/sklep" onClick={() => trackEvent("landing_shop_cta")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary/90">Zbuduj swój zestaw <ArrowRight className="h-4 w-4" /></Link>
      </div>
    </div>
  </section>
  );
};

export default CommunityLoop;
