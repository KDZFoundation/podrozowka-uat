# Pakiet bezpieczeństwa 1 — UAT

Zakres audytu: A01–A04 oraz zabezpieczenia zapisu z A08.
Gałąź: `codex/security-checkout-package-one`, baza UAT `4efab9c`.

## Zmiany

- Klient Firebase (również administrator) nie tworzy bezpośrednio `orders` ani
  `recipient_registrations`. Służą do tego zweryfikowane endpointy serwerowe.
  Odczyt własnych zamówień i administracyjna obsługa istniejących pozostają.
- Dokumenty `authors` są dostępne wyłącznie administratorom. Publiczna strona
  korzysta z `GET /api/public/authors`, który zwraca zamkniętą listę pól aktywnych
  autorów. Email, dane prawne, umowy i notatki nie opuszczają tego endpointu.
- Własny profil można edytować tylko w zakresie danych kontaktowych i wyglądu.
  Rola, punkty, ranga i liczniki nie są edytowalne przez podróżnika. Email i UID
  muszą zgadzać się z uwierzytelnioną tożsamością Firebase.
- Checkout weryfikuje podpisany token Firebase; UID i email z JSON nie są źródłem
  tożsamości. Frontend i lokalny proxy przekazują nagłówek Authorization.
- Serwer waliduje ilości i dane dostawy, sprawdza aktywne flagi przewoźników/COD,
  wylicza koszt dostawy (online 13,99 zł; COD 16,99 zł). Cena produktu nadal
  pochodzi z bazy. Minimum pozostaje **8 sztuk**.
- Adres powrotu ustala konfiguracja serwera, nie `origin_url` klienta.
- Koszyk nie uznaje awarii połączenia za udane zamówienie za pobraniem.
- Stats i ranking współdzielą definicję płatności: jawny payment_status ma
  pierwszeństwo. Bez tego pola akceptowany jest tylko historyczny status paid.
  Liczba zakupów i rejestracji w rankingu nie korzysta z liczników profilu.

## Konfiguracja przed wdrożeniem

1. Na czas aktualizacji UAT pozostawić `SALES_ENABLED=false`. Po wdrożeniu
   kompletnego pakietu włączyć `SALES_ENABLED=true`; `VITE_COMING_SOON` nie może
   wtedy być `true`.
2. Ustawić `CHECKOUT_RETURN_ORIGIN` na właściwy adres HTTPS sklepu UAT.
   Gdy brak tej zmiennej, używane jest `FRONTEND_ORIGIN`; brak poprawnego adresu
   blokuje checkout. Adres nie może zawierać ścieżki, parametrów ani hasła.
3. Dokumenty `feature_flags/{key}` muszą istnieć i zawierać `is_enabled: true`
   dla udostępnionych przewoźników. COD dodatkowo wymaga `cod_payment_enabled`.
   Brak konfiguracji lub błąd jej odczytu nie włącza żadnej metody.
4. Najpierw wdrożyć backend z publiczną projekcją autorów i wyłączoną sprzedażą,
   następnie kompatybilny frontend i reguły. Po smoke testach włączyć sprzedaż
   na UAT. Nie wdrażać samych reguł przed kompatybilnym frontendem/backendem.
5. PROD pozostaje bez zmian. Przy późniejszym przeniesieniu utrzymać
   `SALES_ENABLED=false` i osłonę przedpremierową. Webhook HotPay nie jest
   blokowany bramką sprzedaży — obsługa istniejących płatności pozostaje.

Nie wykonano migracji danych, usuwania dokumentów, zmiany uprawnień IAM ani
konfiguracji żywych usług w ramach przygotowania tego pakietu.

## Testy i granice

Testy negatywne obejmują tożsamość, koszt, adres powrotu, wyłączone metody,
bramkę sprzedaży, nieprawidłowe ilości, projekcję autorów i reguły Firestore.
Emulatory uruchamiane są na fikcyjnym projekcie `demo-podrozowka`, z tym samym
`GCP_PROJECT_ID` i `FIREBASE_TEST_PROJECT_ID`, nigdy na żywej bazie.

Pakiet nie czyści historycznie nadpisanych punktów ani istniejących fałszywych
dokumentów. Wymagają osobnej oceny i naprawy danych. Pozostają też ograniczenia
paginacji statystyk, pełna przebudowa rankingu, kompletne testy E2E, konfiguracja
POD/backup oraz pozostałe pozycje audytu. Starszy alternatywny formularz zamówień
w dashboardzie nadal wymaga osobnego uporządkowania wyboru języka (nie wysyła
primary_language_code); serwer nie pomija walidacji języka.

Dokładniejsze sprawdzenie `tsc -p tsconfig.app.json --noEmit` ujawniło istniejący
dług typów frontendu. Obecne `tsc --noEmit` w głównym tsconfig z `files: []` nie
sprawdza automatycznie referencjonowanych projektów — zielony obecny skrypt
typecheck nie oznacza pełnej poprawności typów frontendu.

Publikacja, wdrożenie UAT i przeniesienie na PROD są osobnymi etapami; lokalne
testy nie są dowodem wdrożenia zabezpieczeń do działających usług.

## Wynik lokalnej weryfikacji — 2026-09-10

- Node 22.23.2; zależności odtworzone przez Bun 1.2.14 z `--frozen-lockfile`.
- Pełny Vitest: **286 zaliczonych**, 10 testów emulatorowych pominiętych tutaj.
- Osobny przebieg emulatorów: **10/10 zaliczonych**, fikcyjny projekt demo.
- `npm run typecheck`: exit 0 (z zastrzeżeniem ograniczenia głównego tsconfig).
- Pełny frontend typecheck: **90 wcześniejszych błędów** zarówno na bazowym
  commicie, jak i po poprawkach; porównanie treści błędów, z pominięciem numerów
  linii, nie wykazało nowych ani zmienionych błędów.
- ESLint: **0 błędów, 12 istniejących ostrzeżeń**.
- `build-vercel-api`: exit 0, `api/_router.cjs` wygenerowany ze źródeł.
- Build Vite UAT z parametrami workflow: exit 0; pozostaje ostrzeżenie rozmiaru
  głównego bundla (około 3,57 MB przed gzip).
- `git diff --check`: exit 0.
- Stan usług: **brak push, wdrożenia, zmian środowiskowych i zmian żywych baz**.

Logi znajdują się w katalogu roboczym `output/package-one-*.log`, poza repo.
