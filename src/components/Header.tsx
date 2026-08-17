import { useState } from "react";
import { Menu, X, Globe, LogIn, LayoutDashboard, Settings, LogOut, Shield, ShoppingCart } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import CartSheetContent from "@/components/CartSheetContent";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import NotificationsBell from "@/components/NotificationsBell";
import podrozowkaLogo from "@/assets/podrozowka-logo.png";

const languages = [
  { code: "pl", name: "Polski" },
  { code: "en", name: "English" },
  { code: "de", name: "Deutsch" },
  { code: "zh", name: "中文" },
];

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [currentLang, setCurrentLang] = useState("pl");
  const { user, signOut, isLoading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { totalCount } = useCart();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, first_name, last_name, avatar_url")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const getInitials = () => {
    const first = profile?.first_name?.[0] ?? "";
    const last = profile?.last_name?.[0] ?? "";
    if (first || last) return `${first}${last}`.toUpperCase();
    return (
      profile?.display_name?.[0]?.toUpperCase() ??
      user?.email?.[0]?.toUpperCase() ??
      "?"
    );
  };

  const displayName =
    profile?.display_name ??
    ([profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || null) ??
    user?.email ??
    "";

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/95 shadow-sm backdrop-blur-md">
      <a href="#main-content" className="sr-only z-[60] rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4">
        Przejdź do treści
      </a>
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <a href="/" className="rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <span className="relative block h-14 w-36 overflow-hidden md:h-16 md:w-44">
              <img
                src={podrozowkaLogo}
                alt="Podróżówka — odwrócona pocztówka"
                className="h-full max-w-none origin-center scale-[1.85] translate-y-[7%]"
              />
            </span>
          </a>

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-1 rounded-xl bg-muted/50 p-1 md:flex">
            <a href="/#about" className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground">
              O projekcie
            </a>
            <Link to="/mapa" className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${pathname === "/mapa" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:bg-background hover:text-foreground"}`}>
              Mapa
            </Link>
            <Link to="/sklep" className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${pathname.startsWith("/sklep") || pathname === "/koszyk" || pathname.startsWith("/checkout") ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:bg-background hover:text-foreground"}`}>
              Sklep
            </Link>
            <Link to="/spolecznosc" className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${pathname === "/spolecznosc" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:bg-background hover:text-foreground"}`}>
              Społeczność
            </Link>
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Language Selector */}
            <div className="hidden md:flex items-center gap-1 text-sm text-muted-foreground">
              <Globe className="w-4 h-4" />
              <select
                value={currentLang}
                onChange={(e) => setCurrentLang(e.target.value)}
                className="bg-transparent border-none text-sm focus:outline-none cursor-pointer"
              >
                {languages.map((lang) => (
                  <option key={lang.code} value={lang.code} disabled={lang.code !== "pl"}>
                    {lang.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Cart */}
            <Sheet>
              <SheetTrigger asChild>
                <button
                  aria-label={`Koszyk${totalCount > 0 ? ` (${totalCount})` : ""}`}
                  className="relative inline-flex items-center gap-2 rounded-lg px-2 py-2 text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <ShoppingCart className="w-5 h-5 text-foreground" />
                  <span className="hidden text-sm font-semibold md:inline">Koszyk</span>
                  {totalCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                      {totalCount > 99 ? "99+" : totalCount}
                    </span>
                  )}
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
                <CartSheetContent />
              </SheetContent>
            </Sheet>

            {/* Logged-in user area */}
            {!isLoading && user ? (
              <>
                <NotificationsBell />

                {/* User Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      aria-label={displayName ? `Menu użytkownika: ${displayName}` : "Menu użytkownika"}
                      className="hidden md:flex items-center gap-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <Avatar className="w-8 h-8 border border-border">
                        <AvatarImage src={profile?.avatar_url ?? undefined} alt={displayName} />
                        <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                          {getInitials()}
                        </AvatarFallback>
                      </Avatar>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuLabel className="font-normal">
                      <p className="text-sm font-medium truncate">{displayName}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate("/dashboard")}>
                      <LayoutDashboard className="w-4 h-4 mr-2" />
                      Mój Panel
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/settings")}>
                      <Settings className="w-4 h-4 mr-2" />
                      Ustawienia
                    </DropdownMenuItem>
                    {isAdmin && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => navigate("/admin")}>
                          <Shield className="w-4 h-4 mr-2" />
                          Panel Admina
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={signOut}
                      className="text-destructive focus:text-destructive"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Wyloguj
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              !isLoading && (
                <Button
                  variant="default"
                  size="sm"
                  className="hidden md:flex"
                  onClick={() => navigate("/logowanie")}
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Zaloguj się
                </Button>
              )
            )}

            {/* Mobile menu button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label={isMenuOpen ? "Zamknij menu" : "Otwórz menu"}
              aria-expanded={isMenuOpen}
              className="md:hidden p-2 text-foreground"
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <nav className="md:hidden py-4 border-t border-border animate-fade-in">
            <div className="flex flex-col gap-4">
              {/* Mobile user info */}
              {user && profile && (
                <div className="flex items-center gap-3 pb-2">
                  <Avatar className="w-10 h-10 border border-border">
                    <AvatarImage src={profile.avatar_url ?? undefined} />
                    <AvatarFallback className="text-sm font-semibold bg-primary/10 text-primary">
                      {getInitials()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{displayName}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                </div>
              )}

              <a href="/#about" className="text-foreground py-2 text-lg" onClick={() => setIsMenuOpen(false)}>O projekcie</a>
              <Link to="/mapa" className="text-foreground py-2 text-lg" onClick={() => setIsMenuOpen(false)}>Mapa</Link>
              <Link to="/sklep" className="text-foreground py-2 text-lg" onClick={() => setIsMenuOpen(false)}>Sklep</Link>
              <Link to="/spolecznosc" className="text-foreground py-2 text-lg" onClick={() => setIsMenuOpen(false)}>Społeczność</Link>

              {user && (
                <>
                  <Button variant="outline" className="mt-2" onClick={() => { navigate("/dashboard"); setIsMenuOpen(false); }}>
                    <LayoutDashboard className="w-4 h-4 mr-2" />
                    Mój Panel
                  </Button>
                  <Button variant="outline" onClick={() => { navigate("/settings"); setIsMenuOpen(false); }}>
                    <Settings className="w-4 h-4 mr-2" />
                    Ustawienia
                  </Button>
                  {isAdmin && (
                    <Button variant="outline" onClick={() => { navigate("/admin"); setIsMenuOpen(false); }}>
                      <Shield className="w-4 h-4 mr-2" />
                      Panel Admina
                    </Button>
                  )}
                  <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { signOut(); setIsMenuOpen(false); }}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Wyloguj
                  </Button>
                </>
              )}

              {!user && !isLoading && (
                <Button variant="default" className="mt-2" onClick={() => { navigate("/logowanie"); setIsMenuOpen(false); }}>
                  <LogIn className="w-4 h-4 mr-2" />
                  Zaloguj się
                </Button>
              )}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
};

export default Header;
