import { Link } from "react-router-dom";
import { Facebook, Heart, Youtube } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-foreground py-10 text-primary-foreground md:py-12">
      <div className="container mx-auto px-4">
        <div className="grid gap-8 md:grid-cols-5 md:gap-6">
          {/* Brand */}
          <div className="md:col-span-2">
            <h3 className="mb-2 font-display text-xl font-bold">Podróżówka</h3>
            <p className="mb-4 max-w-md text-sm leading-relaxed text-primary-foreground/70">
              Odwrócona pocztówka z Polski. Podziękuj osobom spotkanym w podróży 
              i pokaż im piękno naszego kraju.
            </p>
            <div className="flex gap-3">
              <a
                href="https://www.youtube.com/"
                target="_blank"
                rel="noreferrer"
                aria-label="Podróżówka na YouTube"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-foreground/10 transition-colors hover:bg-primary-foreground/20"
              >
                <Youtube className="w-5 h-5" aria-hidden="true" />
              </a>
              <a
                href="#"
                aria-label="Podróżówka na Facebooku"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-foreground/10 transition-colors hover:bg-primary-foreground/20"
              >
                <Facebook className="w-5 h-5" aria-hidden="true" />
              </a>
            </div>
          </div>

          {/* Informacje o platformie */}
          <div>
            <h4 className="mb-3 text-sm font-semibold">O Podróżówce</h4>
            <ul className="space-y-1.5 text-sm text-primary-foreground/70">
              <li><a href="/#about" className="hover:text-primary-foreground transition-colors">O projekcie</a></li>
              <li><Link to="/mapa" className="hover:text-primary-foreground transition-colors">Mapa</Link></li>
              <li><Link to="/spolecznosc" className="hover:text-primary-foreground transition-colors">Społeczność</Link></li>
              <li><Link to="/autorzy" className="hover:text-primary-foreground transition-colors">Autorzy</Link></li>
              <li><Link to="/kontakt" className="hover:text-primary-foreground transition-colors">Kontakt</Link></li>
            </ul>
          </div>

          {/* Zakupy i informacje prawne */}
          <div>
            <h4 className="mb-3 text-sm font-semibold">Sklep i pomoc</h4>
            <ul className="space-y-1.5 text-sm text-primary-foreground/70">
              <li><Link to="/sklep" className="hover:text-primary-foreground transition-colors">Sklep</Link></li>
              <li><Link to="/polityka-prywatnosci" className="hover:text-primary-foreground transition-colors">Polityka prywatności</Link></li>
              <li><Link to="/regulamin" className="hover:text-primary-foreground transition-colors">Regulamin</Link></li>
              <li><Link to="/zwroty" className="hover:text-primary-foreground transition-colors">Zwroty i reklamacje</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div className="md:col-start-5">
            <h4 className="mb-3 text-sm font-semibold">Kontakt</h4>
            <ul className="space-y-1.5 text-sm text-primary-foreground/70">
              <li><Link to="/kontakt" className="hover:text-primary-foreground transition-colors">kontakt@podrozowka.pl</Link></li>
              <li>Polska</li>
              <li className="pt-1">
                <Link 
                  to="/sklep" 
                  className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 transition-colors font-semibold"
                >
                  Zamów Podróżówki
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-primary-foreground/10 pt-5 md:flex-row">
          <p className="text-primary-foreground/80 text-sm">
            © {new Date().getFullYear()} Podróżówka. Wszystkie prawa zastrzeżone.
          </p>
          <p className="flex items-center gap-1 text-primary-foreground/80 text-sm">
            Stworzone z <Heart className="w-4 h-4 text-primary" aria-hidden="true" /> w Polsce
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
