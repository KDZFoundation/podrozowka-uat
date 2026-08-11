import { Link } from "react-router-dom";
import LegalLayout from "@/components/legal/LegalLayout";

const Terms = () => (
  <LegalLayout
    title="Regulamin sklepu i platformy"
    description="Zasady korzystania z platformy Podróżówka i składania zamówień w sklepie."
    path="/regulamin"
    updatedAt="11 sierpnia 2026 r."
  >
    <p>
      Regulamin określa zasady korzystania z serwisu Podróżówka, prowadzenia konta,
      składania zamówień na pocztówki oraz korzystania z funkcji społecznościowych
      i grywalizacji.
    </p>

    <h2>1. Sprzedawca i kontakt</h2>
    <p>
      Sprzedawcą i usługodawcą jest <strong>Dariusz Nowak</strong>, prowadzący działalność
      nierejestrowaną na podstawie art. 5 ustawy – Prawo przedsiębiorców, pod adresem
      Ogrodniki 10E, 82-316 Milejewo.
    </p>
    <ul>
      <li>telefon: <a href="tel:+48695181809">+48 695 181 809</a>,</li>
      <li>e-mail: <a href="mailto:kontakt@podrozowka.pl">kontakt@podrozowka.pl</a>.</li>
    </ul>

    <h2>2. Definicje</h2>
    <ul>
      <li><strong>Sklep</strong> – część serwisu, w której można kupić Podróżówki.</li>
      <li><strong>Klient</strong> – osoba korzystająca ze Sklepu; Konsument to Klient dokonujący zakupu niezwiązanego bezpośrednio z działalnością gospodarczą lub zawodową.</li>
      <li><strong>Podróżówka</strong> – pocztówka ze zdjęciem Polski, przygotowywana do druku po opłaceniu zamówienia.</li>
      <li><strong>Podróżnik</strong> – posiadacz konta, który kupuje Podróżówki i może śledzić ich rejestracje.</li>
      <li><strong>Obdarowany</strong> – osoba, która otrzymała Podróżówkę i po zeskanowaniu kodu QR może dodać ją do historii podróży Podróżnika.</li>
    </ul>

    <h2>3. Konto i korzystanie z platformy</h2>
    <ol>
      <li>Do złożenia zamówienia wymagane jest konto oraz podanie danych niezbędnych do płatności i dostawy.</li>
      <li>Klient podaje dane prawdziwe i aktualne oraz chroni dane dostępowe do konta.</li>
      <li>Zabronione jest korzystanie z platformy w sposób sprzeczny z prawem, zakłócający jej działanie lub naruszający prawa innych osób.</li>
      <li>Punkty, rangi, misje i wpływ kulturowy mają charakter informacyjny i motywacyjny; nie są pieniądzem ani świadczeniem pieniężnym.</li>
    </ol>

    <h2>4. Produkty, warianty językowe i kody QR</h2>
    <ol>
      <li>Opis, zdjęcie, cena oraz dostępne warianty językowe są prezentowane przy produkcie.</li>
      <li>Jeżeli produkt to umożliwia, Klient może wybrać dodatkowy język na froncie pocztówki. Tekst jest dopasowywany do bezpiecznego pola druku.</li>
      <li>Po opłaceniu zamówienia system tworzy dla każdej kupionej sztuki indywidualny kod QR. Kod umożliwia Obdarowanemu połączenie otrzymanej kartki z historią podróży Podróżnika.</li>
      <li>Wydruk może nieznacznie różnić się od obrazu na ekranie z powodu technologii druku i ustawień wyświetlacza.</li>
    </ol>

    <h2>5. Zamówienia</h2>
    <ol>
      <li>Klient wybiera wzory, liczbę sztuk, wariant językowy (jeżeli jest dostępny), dostawę i płatność.</li>
      <li>Minimalna liczba Podróżówek w jednym zamówieniu wynosi <strong>10 sztuk</strong>. Poszczególne wzory mogą być kupowane w dowolnych ilościach.</li>
      <li>Przed płatnością Klient widzi podsumowanie produktów, liczby sztuk, ceny, dostawy i danych do realizacji.</li>
      <li>Umowa zostaje zawarta po przyjęciu zamówienia przez Sprzedawcę, potwierdzonym elektronicznie. Potwierdzenie jest wysyłane na adres e-mail przypisany do konta.</li>
    </ol>

    <h2>6. Ceny i płatności</h2>
    <ol>
      <li>Ceny są podawane w złotych polskich, a Sklep przed płatnością pokazuje całkowitą kwotę wraz z dostawą.</li>
      <li>Dostępne metody płatności są prezentowane w checkout. Płatności online obsługuje HotPay albo Przelewy24 — zależnie od aktywnej bramki wskazanej przed finalizacją zamówienia.</li>
      <li>Druk w formule print on demand jest uruchamiany po potwierdzeniu opłacenia zamówienia.</li>
      <li>Na żądanie Klienta Sprzedawca przekazuje dokument sprzedaży zgodnie z obowiązującymi przepisami i zakresem podanych danych.</li>
    </ol>

    <h2>7. Dostawa i realizacja</h2>
    <ol>
      <li>Dostawy realizowane są na terytorium Polski metodami wskazanymi w checkout.</li>
      <li>Koszt i dostępność dostawy są widoczne przed złożeniem zamówienia.</li>
      <li>Termin zależy od przygotowania druku POD i wybranej dostawy. Status zamówienia jest dostępny w serwisie lub przekazywany e-mailem.</li>
    </ol>

    <h2>8. Odstąpienie, zwroty i reklamacje</h2>
    <p>
      Szczegółową procedurę opisuje strona <Link to="/zwroty">Zwroty i reklamacje</Link>.
      Konsument ma co do zasady 14 dni na odstąpienie od umowy zawartej na odległość.
      Wyjątek może dotyczyć produktu nieprefabrykowanego, wykonanego według specyfikacji
      Konsumenta lub służącego jego zindywidualizowanym potrzebom – wyłącznie w zakresie,
      w jakim spełnione są ustawowe przesłanki.
    </p>

    <h2>9. Prawa autorskie</h2>
    <p>
      Zdjęcia, grafiki, znaki i treści Podróżówki są chronione prawem. Ich kopiowanie,
      odsprzedaż lub rozpowszechnianie bez zgody uprawnionych osób jest zabronione.
    </p>

    <h2>10. Postanowienia końcowe</h2>
    <ol>
      <li>W sprawach nieuregulowanych stosuje się prawo polskie, w szczególności przepisy o prawach konsumenta i Kodeks cywilny.</li>
      <li>Zmiana Regulaminu nie wpływa na zamówienia złożone przed jej publikacją.</li>
      <li>Spory z Konsumentem rozstrzyga sąd właściwy według przepisów powszechnie obowiązujących.</li>
    </ol>
  </LegalLayout>
);

export default Terms;
