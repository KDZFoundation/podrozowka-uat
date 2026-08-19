import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import travelerHeroImg from "@/assets/images/traveler-hero.png";

const Hero = () => (
  <section className="relative flex min-h-[580px] items-center overflow-hidden bg-[linear-gradient(90deg,_#3b3632_0%,_#655e58_35%,_#968e88_70%,_#857d77_100%)] pt-16 md:min-h-[660px] md:pt-20">
    <div className="relative z-10 container mx-auto px-4 py-16 md:py-20">
      <div className="max-w-3xl text-center md:text-left">
        <span className="mb-5 inline-flex rounded-full bg-[#c42021] px-3.5 py-1 text-xs font-medium text-white animate-fade-up sm:text-sm">
          Odwrócona pocztówka z Polski
        </span>
        <h1 className="mb-5 font-display text-4xl font-bold leading-[1.1] text-white md:text-6xl lg:text-7xl animate-fade-up" style={{ animationDelay: "0.08s" }}>
          Podziękuj. Zostaw wspomnienie. Pokaż Polskę.
        </h1>
        <p className="mb-8 max-w-2xl text-base leading-relaxed text-white/90 sm:text-lg md:text-xl animate-fade-up" style={{ animationDelay: "0.16s" }}>
          Wybierz kartki, które opowiedzą o Polsce osobom spotkanym w podróży. Ty wybierasz wzory — my przygotowujemy je do druku.
        </p>
        <div className="mb-8 flex flex-col justify-center gap-3 sm:flex-row md:justify-start animate-fade-up" style={{ animationDelay: "0.24s" }}>
          <Link to="/sklep" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#c42021] px-6 py-3.5 font-semibold text-white shadow-md transition-all hover:bg-[#b01c1d]">
            Wybierz Podróżówki <ArrowRight className="h-4 w-4" />
          </Link>
          <a href="/#gra" className="inline-flex items-center justify-center rounded-xl border border-white/30 bg-white/20 px-6 py-3.5 font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/30">
            Zobacz jak to działa
          </a>
        </div>
        <div className="flex flex-col gap-2 text-sm text-white/90 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-2 animate-fade-up" style={{ animationDelay: "0.32s" }}>
          {["Wybierasz ulubione wzory", "Łączysz minimum 10 sztuk", "My drukujemy i wysyłamy do Ciebie"].map((item) => (
            <span key={item} className="inline-flex items-center justify-center gap-1.5 md:justify-start">
              <Check className="h-4 w-4 text-[#e03131]" /> {item}
            </span>
          ))}
        </div>
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 hidden w-[min(31vw,360px)] -translate-y-1/2 md:block lg:right-10">
        <div className="absolute inset-[14%] rounded-full bg-[#111111]/20 blur-3xl"></div>
        <img
          src={travelerHeroImg}
          alt="Wędrownik Podróżówka"
          referrerPolicy="no-referrer"
          className="relative w-full animate-traveler-walk drop-shadow-[0_18px_24px_rgba(0,0,0,0.38)]"
        />
      </div>
    </div>
  </section>
);

export default Hero;
