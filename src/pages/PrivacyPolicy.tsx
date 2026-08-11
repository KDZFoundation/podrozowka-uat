import LegalLayout from "@/components/legal/LegalLayout";

const PrivacyPolicy = () => (
  <LegalLayout
    title="Polityka prywatności"
    description="Informacje o przetwarzaniu danych osobowych w serwisie i sklepie Podróżówka."
    path="/polityka-prywatnosci"
    updatedAt="11 sierpnia 2026 r."
  >
    <p>
      Polityka wyjaśnia, jakie dane przetwarzamy w związku z serwisem i Sklepem
      Podróżówka, w jakich celach oraz jakie prawa przysługują osobom, których dane dotyczą.
    </p>

    <h2>1. Administrator</h2>
    <p>
      Administratorem danych jest <strong>Dariusz Nowak</strong>, prowadzący działalność
      nierejestrowaną, Ogrodniki 10E, 82-316 Milejewo. Kontakt w sprawach danych:
      {' '}<a href="mailto:kontakt@podrozowka.pl">kontakt@podrozowka.pl</a>,{' '}
      <a href="tel:+48695181809">+48 695 181 809</a>. Administrator nie wyznaczył inspektora ochrony danych.
    </p>

    <h2>2. Zakres i cele przetwarzania</h2>
    <ul>
      <li><strong>Konto:</strong> e-mail, nazwa wyświetlana, imię i nazwisko oraz dane przekazane przez dostawcę logowania – prowadzenie konta.</li>
      <li><strong>Zamówienie:</strong> produkty, liczba sztuk, języki, dane odbiorcy, adres lub punkt odbioru, telefon, dane do dokumentu sprzedaży i status płatności – zawarcie i wykonanie umowy.</li>
      <li><strong>QR:</strong> dane wpisane przez Obdarowanego i wiadomość – połączenie kartki z historią podróży.</li>
      <li><strong>Kontakt, zwroty i reklamacje:</strong> dane z korespondencji i dokumentacja sprawy – obsługa zgłoszenia.</li>
      <li><strong>Bezpieczeństwo:</strong> dane sesji, adres IP i logi techniczne – ochrona i diagnostyka serwisu.</li>
    </ul>

    <h2>3. Podstawy prawne</h2>
    <ul>
      <li>wykonanie umowy lub działania przed jej zawarciem – art. 6 ust. 1 lit. b RODO;</li>
      <li>obowiązek prawny, w tym podatkowy – art. 6 ust. 1 lit. c RODO;</li>
      <li>prawnie uzasadniony interes: bezpieczeństwo, obrona przed roszczeniami i obsługa zapytań – art. 6 ust. 1 lit. f RODO;</li>
      <li>zgoda, gdy jest wymagana – art. 6 ust. 1 lit. a RODO.</li>
    </ul>

    <h2>4. Odbiorcy danych</h2>
    <p>Dane otrzymują wyłącznie podmioty potrzebne do realizacji wskazanych celów, w szczególności:</p>
    <ul>
      <li>Supabase – baza danych, autoryzacja i pliki;</li>
      <li>Vercel – hosting aplikacji;</li>
      <li>Google – jeżeli Klient wybierze logowanie Google;</li>
      <li>Przelewy24 – przy płatności online;</li>
      <li>operator dostawy i drukarnia POD – w zakresie niezbędnym do realizacji zamówienia;</li>
      <li>uprawnione organy publiczne oraz doradcy – gdy wymaga tego prawo.</li>
    </ul>
    <p>
      Dostawcy technologii mogą przetwarzać dane poza EOG. W takim przypadku transfer
      odbywa się z zastosowaniem mechanizmów wymaganych przez RODO, np. standardowych klauzul umownych.
    </p>

    <h2>5. Okres przechowywania</h2>
    <ul>
      <li>dane konta – przez czas jego prowadzenia, a następnie przez okres potrzebny do rozliczeń i obrony roszczeń;</li>
      <li>dane zamówień i dokumentów sprzedaży – przez okres wymagany przepisami;</li>
      <li>dane reklamacji i korespondencji – do zakończenia sprawy i upływu przedawnienia roszczeń;</li>
      <li>dane oparte na zgodzie – do jej cofnięcia, chyba że istnieje inna podstawa prawna.</li>
    </ul>

    <h2>6. Prawa osoby, której dane dotyczą</h2>
    <p>
      Przysługuje Ci prawo dostępu do danych, ich sprostowania, usunięcia, ograniczenia
      przetwarzania, przeniesienia, sprzeciwu oraz cofnięcia zgody. Wniosek wyślij na
      {' '}<a href="mailto:kontakt@podrozowka.pl">kontakt@podrozowka.pl</a>. Możesz także złożyć
      skargę do Prezesa Urzędu Ochrony Danych Osobowych.
    </p>

    <h2>7. Dobrowolność podania danych</h2>
    <p>
      Podanie danych jest dobrowolne, ale brak danych oznaczonych jako wymagane może
      uniemożliwić założenie konta, zakup, płatność, dostawę lub rejestrację QR.
    </p>

    <h2>8. Cookies</h2>
    <p>
      Serwis wykorzystuje techniczne pliki cookies i pamięć przeglądarki potrzebne do
      logowania, bezpieczeństwa, koszyka i działania strony. Ich ograniczenie może
      uniemożliwić korzystanie z części funkcji. Jeżeli zostaną włączone dodatkowe
      narzędzia analityczne lub marketingowe, Polityka zostanie zaktualizowana, a zgoda
      będzie pobierana, gdy będzie wymagana.
    </p>

    <h2>9. Zmiany Polityki</h2>
    <p>Aktualna wersja Polityki jest stale dostępna pod tym adresem wraz z datą aktualizacji.</p>
  </LegalLayout>
);

export default PrivacyPolicy;
