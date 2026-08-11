# Audyt funkcjonalności, UX/UI i landing page — 10.08.2026

## Zakres i metoda

Audyt wykonano ręcznie na działającym środowisku DEV (`http://127.0.0.1:4173`) w widoku desktop oraz mobilnym 390 × 844 px, na zalogowanym koncie. Sprawdzono landing page, katalog, dodawanie do koszyka, koszyk, logowanie i rejestrację oraz panel podróżnika. Nie wykonywano płatności, nie tworzono zamówienia ani nie rejestrowano cudzej kartki QR.

Legenda: **P0** — blokada UAT, **P1** — istotne przed premierą, **P2** — usprawnienie po uruchomieniu.

## Wynik skrócony

| Obszar | Wynik | Ocena |
| --- | --- | --- |
| Landing — przekaz i pierwsze CTA | Hero, CTA i przykładowa kartka działają | P1 |
| Landing — wersja mobilna | Menu hamburgerowe i hero mieszczą się poprawnie | gotowe z uwagami |
| Katalog | Ładuje 4 aktywne wzory, filtry są widoczne | gotowe z uwagami |
| Koszyk i checkout | Koszyk nie rozpoznaje aktywnych produktów i blokuje płatność | **P0** |
| Logowanie/rejestracja | Formularze są dostępne; widoczny niezweryfikowany Apple OAuth | P1 |
| Panel podróżnika | Widoczne rangi, misje i statystyki | P1 |
| Panel administratora | Konto użyte w audycie nie otrzymuje dostępu do `/admin` | **P0** do wyjaśnienia |
| Wielojęzyczność | Przełącznik zmienia wybór, ale treść pozostaje po polsku | P1 |
| QR / obdarowany / POD PDF | Niezweryfikowane w tej rundzie | warunek UAT |

## P0 — naprawić przed przejściem DEV → UAT

### 1. Koszyk nie potwierdza produktów dostępnych w sklepie

**Dowód:** w sklepie aktywne były 4 wzory. Po wybraniu „Dodaj 1” dla Podróżówki Tajlandia licznik nagłówka zmienił się z 10 na 11. Po wejściu do koszyka obie pozycje miały nazwę „Bez tytułu”, status „Produkt niedostępny”, ilość rozliczaną jako `0 / 10`, sumę `0,00 zł` oraz nieaktywny przycisk przejścia do dostawy i płatności.

**Skutek:** nie można złożyć płatnego zamówienia, a więc uruchomić całej ścieżki POD i QR.

**Zakres naprawy:**

1. Zdiagnozować odpowiedź zapytania `useCartItems` do `card_designs` — nie ukrywać błędu React Query jako „produkt niedostępny”.
2. Ujednolicić kontrakt między katalogiem, szczegółem produktu i koszykiem: `id`, `active`, `price_grosze`, `currency`, relacje `countries` i `categories`.
3. Dodać test integracyjny: aktywny wzór → dodanie 1 szt. → koszyk pokazuje nazwę, 4,99 zł i ilość → zwiększenie do 10 → przycisk checkout aktywny.
4. Dodać czytelny komunikat techniczny dla błędu pobrania danych, oddzielony od rzeczywiście usuniętego/dezaktywowanego produktu.

**Kryterium akceptacji:** koszyk i checkout poprawnie obsługują mieszany zestaw 10+ sztuk aktywnych wzorów.

**Status 10.08.2026 (po audycie):** dodano zapis bezpiecznej migawki produktu przy dodaniu do koszyka. Na działającym DEV nowo dodany wzór został poprawnie odczytany w koszyku (nazwa, kraj, cena 4,99 zł, ilość), minimum 10 zostało rozpoznane, a przejście do `/checkout` odblokowane. Serwer nadal pozostaje źródłem prawdy przy tworzeniu zamówienia. Stare wpisy localStorage bez migawki mogą wymagać usunięcia i ponownego dodania; pełny test zamówienia nadal jest wymagany.

### 2. Dostęp do panelu administratora musi być oparty o rolę w bazie

**Dowód:** w czasie audytu zalogowane konto `fundacja@d-arka.org` po wejściu na `/admin` zostało pokazane w panelu podróżnika, bez menu administratora.

**Uwaga:** może to wynikać z braku roli administratora dla tego konkretnego konta w DEV. Niezależnie od przyczyny trzeba to udowodnić testem, ponieważ administrator zarządza wzorami, autorami, produktami i kolejką POD.

**Zakres naprawy:**

1. Zweryfikować rekord `user_roles` i polityki RLS dla konta administratora.
2. Usunąć wszelkie klientowe, hardkodowane wyjątki adresów e-mail — decyzja ma wynikać wyłącznie z roli w bazie.
3. Dodać test: konto podróżnika nie ma wejścia do `/admin`; konto administratora ma dostęp do wszystkich zakładek i operacji administracyjnych.

**Kryterium akceptacji:** jedno nazwane konto administratora DEV/UAT ma przewidywalny dostęp po ponownym logowaniu.

**Status 10.08.2026 (po audycie):** usunięto klientowe wyjątki adresów e-mail i przygotowano migrację `20260810170000_bootstrap_darka_admin_role.sql`, która idempotentnie nada rolę `admin` kontu `fundacja@d-arka.org`, jeżeli konto istnieje w danym projekcie Supabase. Migrację trzeba wdrożyć do DEV, a następnie odpowiednio do UAT po sprawdzeniu konta.

### 3. Niezweryfikowana pełna ścieżka sprzedażowa

Blokada koszyka uniemożliwiła audyt checkoutu, utworzenia zamówienia, płatności testowej, wygenerowania QR dla każdej sztuki oraz pliku PDF SRA3. Nie należy przenosić wersji do UAT bez wykonania tej ścieżki na danych testowych.

## P1 — funkcjonalność i treść

### Landing page

1. **Przełącznik języka pozorny.** Po wybraniu `English` w selektorze cała treść hero, CTA, menu i sekcji pozostaje po polsku. Należy albo wdrożyć prawdziwe tłumaczenia czterech języków, albo ukryć selektor do czasu ich gotowości.
2. **Za małe logo w nagłówku.** Na desktopie i mobilnie znak jest czytelny dopiero po dużym przybliżeniu; nie buduje rozpoznawalności marki.
3. **Niespójne dane społecznościowe.** Mapa pokazuje `0 krajów / 0 zarejestrowanych`, a sekcja języków prezentuje hasło „50 krajów”. Trzeba rozdzielić: „dostępne języki” od „krajów osiągniętych”.
4. **Powielenie sekcji językowych.** Na stronie jednocześnie występuje duża statyczna sekcja „Podziękuj w każdym języku” i dynamiczna sekcja „Wybierz język podziękowania”. To wydłuża landing i rozprasza przed zakupem. Zostawić jedną, dynamiczną sekcję prowadzącą do filtru sklepu.
5. **Niepoprawne przykłady tłumaczeń.** Dla wielu krajów karta pokazuje polskie „Dziękuję / Pozdrowienia” zamiast tekstu danego języka. Dane słownikowe należy uzupełnić albo ukryć niegotowe kraje.
6. **Puste dane społecznościowe są poprawnie opisane**, ale na etapie UAT warto użyć wyraźnie oznaczonych danych demonstracyjnych. W produkcji nie wolno udawać realnych zasięgów.
7. **Puste/placeholderowe kanały społecznościowe.** Instagram i Facebook w stopce prowadzą do `#`; przed UAT podać realne adresy albo ukryć ikony.
8. **Link „Dołącz do społeczności” w pustej galerii prowadzi do `#auth`, nie do `/auth`.** Należy poprawić, bo użytkownik nie dostaje formularza logowania/rejestracji.

### Sklep i karta produktu

1. Katalog po załadowaniu jest czytelny: filtry, kraj, kategoria, cena, CTA „Dodaj 1” i „Wybierz” działają wizualnie poprawnie.
2. Pierwsze odczytanie katalogu przez audyt widziało `0` wyników, a po zakończeniu pobierania pojawiły się 4. Należy dodać jednoznaczny szkielet ładowania zamiast chwilowo pustego katalogu.
3. W kategorii „Architektura” widać uszkodzoną/niezaładowaną ikonę. Ustalić fallback ikon i zweryfikować URL-e kategorii.
4. Nazwy automatyczne są technicznie poprawne (`Podróżówka Tajlandia, A V01 TH`), ale w karcie sklepu mogą być zbyt „katalogowe”. Dla klienta warto pokazywać tytuł motywu jako nazwę główną, a kod wzoru jako drugorzędny detal.

### Autoryzacja

1. Formularze logowania, rejestracji i resetu hasła są dostępne.
2. Widoczne są przyciski Google i Apple. Apple należy przetestować na każdym środowisku; jeżeli provider nie jest skonfigurowany, przycisk trzeba usunąć lub oznaczyć jako niedostępny.
3. Powrót ze stron autoryzacji oraz przekierowanie po logowaniu powinny zachowywać zamierzony adres, zwłaszcza checkout.

### Panel podróżnika i grywalizacja

1. Rangi są spójne z aktualnym progiem startowym: `Zwiadowca 0`, kolejna `Odkrywca 500`.
2. Ten sam stan rangi pokazuje się dwukrotnie: w karcie „Twoja ranga” oraz w sekcji „Cultural Impact”. Należy scalić te bloki w jeden moduł postępu.
3. Tytuł `Cultural Impact` jest po angielsku w polskim panelu. Zmienić na `Wpływ kulturowy`.
4. Misje i pusty dziennik są zrozumiałe dla nowego użytkownika. Po naprawie zakupu trzeba potwierdzić realne naliczanie punktów i przejście po rejestracji QR.
5. Przycisk „Pochwal się statystykami” wymaga osobnego testu — nie audytowano publikacji/udostępniania.

## UX/UI — elementy pozytywne

- Hero ma jasną obietnicę: podziękowanie, wspomnienie, promocja Polski.
- Dwa główne CTA prowadzą odpowiednio do sklepu i do wyjaśnienia mechaniki.
- Przykładowa Podróżówka Tajlandia pokazuje przód, tył, flagę, tajski tekst i QR; obrót jest dostępny jako przycisk.
- Mobilny hero mieści się w jednym ekranie, CTA są wygodne do kliknięcia, a menu przechodzi do hamburgera.
- Katalog pokazuje minimum 10 sztuk jako warunek całego koszyka, a nie pojedynczego wzoru — zgodnie z założeniem biznesowym.
- Sekcje o grze i „O projekcie” dobrze komunikują pętlę: wzór → wręczenie → QR obdarowanego → relacja → wpływ.

## Testy obowiązkowe przed UAT

| Przepływ | Oczekiwany wynik |
| --- | --- |
| Sklep → 2 wzory → 10 sztuk łącznie | Koszyk liczy nazwy, ceny, ilości i minimum poprawnie |
| Koszyk → checkout | Wybór dostawy, dane odbiorcy i płatność testowa działają |
| Opłacone zamówienie → QR | Powstaje dokładnie jeden QR na każdą fizyczną kartkę |
| QR → formularz obdarowanego | Formularz językowo odpowiada wzorowi; rejestracja powstaje dopiero po wysłaniu |
| Rejestracja → dashboard | Kartka zmienia stan na „Wręczona — zarejestrowana”, naliczają się punkty/ranga/misja |
| Admin → POD | Administrator widzi zamówienie, generuje PDF SRA3 i pobiera plik z 8-up impozycją |
| PDF | Front/tył, flagi, autor, QR i znaczniki cięcia są zgodne z akceptacją drukarni |
| Role | Podróżnik nie ma `/admin`; administrator ma dostęp |
| Mobilne 390 px | Landing, sklep, karta produktu, koszyk, checkout i QR bez poziomego przewijania i bez zbyt małych CTA |

## Kolejność prac

1. **P0:** naprawić rozpoznawanie produktu w koszyku oraz pokryć je testem integracyjnym.
2. **P0:** potwierdzić i poprawić role administratora w DEV.
3. **P0:** wykonać test pełnej ścieżki POD + QR + PDF na jednym zamówieniu testowym.
4. **P1:** urealnić języki i dane landing page, usunąć duplikaty oraz niedziałające linki.
5. **P1:** scalić kartę grywalizacji i zlokalizować angielskie elementy panelu.
6. **P1:** zweryfikować Google/Apple OAuth na DEV i UAT.
7. **P2:** poprawić logo, ikony kategorii i katalogowe nazwy produktów.

## Decyzja release

**DEV → UAT: NO-GO**, dopóki punkt P0.1 (koszyk/checkout) nie przejdzie testu i nie zostaną potwierdzone role administratora oraz pełna ścieżka QR/POD/PDF.
