import LegalLayout from "@/components/legal/LegalLayout";

const Returns = () => (
  <LegalLayout
    title="Zwroty i reklamacje"
    description="Informacje o odstąpieniu od umowy, zwrotach i reklamacjach w sklepie Podróżówka."
    path="/zwroty"
    updatedAt="11 sierpnia 2026 r."
  >
    <p>
      Poniższe zasady dotyczą zakupów konsumenckich w Sklepie Podróżówka. Jeżeli kupujesz
      jako przedsiębiorca, zastosowanie mają zasady wynikające z zawartej umowy i przepisów.
    </p>

    <h2>1. Odstąpienie od umowy w 14 dni</h2>
    <p>
      Konsument może odstąpić od umowy zawartej na odległość w terminie 14 dni od otrzymania
      towaru, bez podawania przyczyny. Wystarczy wysłać oświadczenie przed upływem terminu
      na adres <a href="mailto:kontakt@podrozowka.pl">kontakt@podrozowka.pl</a>.
    </p>
    <p>W oświadczeniu podaj: imię i nazwisko, numer zamówienia, datę zakupu, listę zwracanych produktów oraz numer rachunku do zwrotu, jeżeli płatność ma wrócić inną drogą.</p>

    <h2>2. Kiedy prawo odstąpienia może nie przysługiwać</h2>
    <p>
      Prawo odstąpienia może być wyłączone dla rzeczy nieprefabrykowanej, wykonanej według
      specyfikacji Konsumenta lub służącej jego zindywidualizowanym potrzebom. Dotyczy to
      wyłącznie zamówień, które rzeczywiście spełniają ustawowe przesłanki – samo użycie
      technologii print on demand nie wyłącza automatycznie prawa zwrotu.
    </p>

    <h2>3. Odesłanie produktu i zwrot płatności</h2>
    <ol>
      <li>Po wysłaniu oświadczenia odeślij produkt niezwłocznie, nie później niż w 14 dni, na adres: Dariusz Nowak, Ogrodniki 10E, 82-316 Milejewo.</li>
      <li>Koszt odesłania ponosi Konsument, chyba że Sprzedawca zgodził się go ponieść albo dostarczono produkt wadliwy.</li>
      <li>Sprzedawca zwraca płatności, w tym koszt najtańszej zwykłej dostawy, nie później niż w 14 dni od otrzymania oświadczenia. Zwrot może zostać wstrzymany do otrzymania towaru lub potwierdzenia jego odesłania.</li>
      <li>Zwrot następuje tą samą metodą płatności, chyba że uzgodniono inną bez dodatkowych kosztów.</li>
    </ol>

    <h2>4. Reklamacja – niezgodność towaru z umową</h2>
    <p>
      Jeżeli Podróżówka jest niezgodna z umową, opisz problem i dołącz zdjęcia, numer
      zamówienia oraz żądanie (np. naprawa, wymiana, obniżenie ceny albo odstąpienie, gdy
      przepisy na to pozwalają). Zgłoszenie wyślij na{' '}
      <a href="mailto:kontakt@podrozowka.pl">kontakt@podrozowka.pl</a> lub pocztą na adres Sprzedawcy.
    </p>
    <p>
      Odpowiedź na reklamację przekazujemy bez zbędnej zwłoki, nie później niż w terminie
      wynikającym z obowiązujących przepisów. Wadliwy produkt należy udostępnić do oceny
      w uzgodniony sposób.
    </p>

    <h2>5. Formularz odstąpienia</h2>
    <p>Możesz skorzystać z poniższego wzoru, ale nie jest to obowiązkowe:</p>
    <div className="rounded-lg border border-border bg-muted/30 p-5 text-sm text-muted-foreground">
      <p>„Ja, [imię i nazwisko], niniejszym informuję o odstąpieniu od umowy sprzedaży Podróżówek z zamówienia [numer], zawartej dnia [data]. Proszę o zwrot płatności. Data, podpis (jeżeli formularz jest wysyłany w wersji papierowej).”</p>
    </div>

    <h2>6. Kontakt</h2>
    <p>
      Dariusz Nowak<br />
      Ogrodniki 10E<br />
      82-316 Milejewo<br />
      <a href="mailto:kontakt@podrozowka.pl">kontakt@podrozowka.pl</a><br />
      <a href="tel:+48695181809">+48 695 181 809</a>
    </p>
  </LegalLayout>
);

export default Returns;
