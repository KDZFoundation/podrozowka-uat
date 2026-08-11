import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import heroImage from "@/assets/hero-poland.jpg";

const Hero = () => (
  <section className="relative flex min-h-[680px] items-center overflow-hidden pt-16 md:min-h-[720px] md:pt-20">
    <div className="absolute inset-0">
      <img src={heroImage} alt="Krajobraz Polski z Tatrami w tle" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      <div className="absolute inset-0 bg-gradient-to-b from-foreground/75 via-foreground/45 to-foreground/30 md:bg-gradient-to-r md:from-foreground/80 md:via-foreground/55 md:to-foreground/15" />
    </div>
    <div className="relative z-10 container mx-auto px-4 py-16 md:py-20">
      <div className="max-w-3xl text-center md:text-left">
        <span className="mb-5 inline-flex rounded-full border border-primary-foreground/30 bg-primary/90 px-3 py-1.5 text-sm font-semibold text-primary-foreground animate-fade-up">Odwrócona pocztówka z Polski</span>
        <h1 className="mb-5 font-display text-4xl font-bold leading-tight text-primary-foreground md:text-6xl lg:text-7xl animate-fade-up" style={{ animationDelay: "0.08s" }}>Podziękuj. Zostaw wspomnienie. Pokaż Polskę.</h1>
        <p className="mb-8 max-w-2xl text-lg leading-relaxed text-primary-foreground/90 md:text-xl animate-fade-up" style={{ animationDelay: "0.16s" }}>
          Wybierz kartki, które opowiedzą o Polsce osobom spotkanym w podróży. Ty wybierasz wzory — my przygotowujemy je do druku.
        </p>
        <div className="mb-8 flex flex-col justify-center gap-3 sm:flex-row md:justify-start animate-fade-up" style={{ animationDelay: "0.24s" }}>
          <Link to="/sklep" className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 font-semibold text-primary-foreground shadow-elevated transition-all hover:bg-primary/90 hover:shadow-card">Wybierz Podróżówki <ArrowRight className="h-4 w-4" /></Link>
          <a href="/#gra" className="inline-flex items-center justify-center rounded-xl border border-primary-foreground/35 bg-primary-foreground/10 px-6 py-3.5 font-semibold text-primary-foreground backdrop-blur-sm transition-colors hover:bg-primary-foreground/20">Zobacz jak to działa</a>
        </div>
        <div className="flex flex-col gap-2 text-sm text-primary-foreground/85 sm:flex-row sm:flex-wrap sm:gap-x-5 sm:gap-y-2 animate-fade-up" style={{ animationDelay: "0.32s" }}>
          {["Wybierasz ulubione wzory", "Łączysz minimum 10 sztuk", "My drukujemy i wysyłamy do Ciebie"].map((item) => (
            <span key={item} className="inline-flex items-center justify-center gap-1.5 md:justify-start"><Check className="h-4 w-4 text-primary" /> {item}</span>
          ))}
        </div>
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 hidden w-[min(31vw,360px)] -translate-y-1/2 md:block lg:right-10">
        <div className="absolute inset-[14%] rounded-full bg-primary/20 blur-3xl" />
        <img
          src="/assets/traveler-hero.png"
          alt=""
          className="relative w-full animate-traveler-walk drop-shadow-[0_18px_24px_rgba(0,0,0,0.38)]"
        />
      </div>
    </div>
  </section>
);

export default Hero;
