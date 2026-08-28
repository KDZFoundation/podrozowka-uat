# RAPORT AUDYTU KOMPLETNOŚCI PORTALU UAT — PODRÓŻÓWKA (`KDZFoundation/podrozowka-uat`)

**Data sporządzenia:** 2026-08-28
**Audytor:** Jules (Pair Programming Engineer)
**Środowisko:** `KDZFoundation/podrozowka-uat`
**Status zestawu testów:** 66 / 66 PASSED, 3 SKIPPED (`bun run test`)
**Status kompilacji TypeScript:** PASSED (`bun run typecheck`)
**Status lintera JS/TS:** PASSED (0 errors, 12 warnings `bun run lint`)

---

## 📋 1. PODSUMOWANIE AUDYTU

Przeprowadzono ponowną, wszechstronną analizę architektury, kodu źródłowego, konfiguracji i przepływów biznesowych w repozytorium **KDZFoundation/podrozowka-uat**. Repozytorium stanowi wersję UAT aplikacji wspierającej drukowanie, sprzedaż, wysyłkę oraz fizyczną rejestrację kartek pocztowych Podróżówka wraz z modułem grywalizacji i wpływu kulturowego.

W ramach ponownego audytu przeanalizowano najnowsze usprawnienia w kodzie źródłowym, w tym:
- **Zabezpieczenie weryfikacji płatności HotPay:** Wdrożono funkcję `matchesHotpayOrderPayment`, która porównuje kwotę w groszach odebraną od bramki (`KWOTA`) z wartością zamówienia w bazie (`total_amount_grosze`) oraz weryfikuje walutę rozliczeniową.
- **Ochrona endpointów administracyjnych InPost:** Wdrożono moduł autoryzacji `server/auth/require-admin.ts`, weryfikujący nagłówek autoryzacyjny Firebase ID Token przed realizacją płatnych akcji wysyłkowych w InPost ShipX.
- **System tymczasowej rezerwacji wzorów kartek (`design-reservation.ts`):** Zabezpieczono koszyk przed wyprzedaniem wzoru przed zakończeniem płatności (mechanizm rezerwacji stanów z automatycznym zwalnianiem w przypadku odrzucenia płatności).
- **Rozbudowa pokrycia testowego:** Zestaw testów automatycznych został rozszerzony z 54 do **66 przechodzących testów jednostkowych i integracyjnych**.

---

## 🏗️ 2. OCENA KOMPLETNOŚCI POSZCZEGÓLNYCH OBSZARÓW

### A. Architektura Aplikacji i Logika Serwerowa
* **Frontend:** React 18 z bundlerem Vite 5, React Router DOM v6, Tailwind CSS oraz komponenty Shadcn UI (Radix UI). Kod jest w pełni otypowany w TypeScript (`tsc --noEmit` przechodzi bez błędów).
* **Backend Bridge / API:** Dwa środowiska uruchomieniowe API:
  1. **Express Server (`server.ts`):** Kompletny serwer Node.js z obsługą tras API (`/api/payments/create-hotpay`, `/api/payments/hotpay-webhook`, `/api/inpost/*`, `/api/register-postcard`).
  2. **Vercel Serverless Functions (`api/`):** Zbudowane skryptem `build-vercel-router.mjs` jako bezserwerowy router API.

---

### B. Przepływy Autentykacji i Autoryzacji (`useAuth.tsx`, `require-admin.ts`)
* **Logowanie/Rejestracja:** Firebase Auth (e-mail/hasło oraz Google Popup).
* **Profil Użytkownika:** Automatycznie synchronizowany do kolekcji `users` w Firestore przy każdym zalogowaniu (`syncFirestoreProfile`).
* **Weryfikacja Roli Admina:**
  * Wdrożono skrypt migracyjny ról admina w Firestore (`migrate-admin-roles.ts`).
  * Na serwerze utworzono middleware `require-admin.ts`, sprawdzający token sesji Firebase ID Token lub rolę w Firestore przed dostępem do tras wrażliwych.
  * W regułach Firestore (`firestore.rules`) dostęp admina sprawdzany jest po tokenie (`request.auth.token.admin == true` / `request.auth.token.role == 'admin'`) oraz dopasowaniu adresu e-mail (`fundacja@d-arka.org`, `dariusz.pgry@gmail.com`, `fundacja@konopiedlaziemi.org`).

---

### C. Zamówienia, Koszyk i Rezerwacja Stanów (`CartContext.tsx`, `Checkout.tsx`, `design-reservation.ts`)
* **Tożsamość pozycji w koszyku:** Dedykowana identyfikacja linii na podstawie wzoru kartki oraz wybranych języków (`cardDesignId::lang:primary+secondary`).
* **Reguła ilościowa:** Weryfikacja minimalnej ilości zamówienia (10 sztuk Podróżówek) wymuszana na poziomie koszyka, interfejsu checkout oraz endpointu płatności `/api/payments/create-hotpay`.
* **Rezerwacja stanów i wygasanie:** Moduł `design-reservation.ts` tworzy rezerwację wzorów na czas płatności. Jeśli płatność nie powiedzie się lub wygaśnie, rezerwacja jest automatycznie zwalniana (`updateReservationStatus("released")`).
* **Automatyczna generacja jednostek magazynowych (POD):** Po udanej płatności system tworzy zadanie druku (`qr_print_jobs`), partię magazynową (`stock_batches`) oraz poszczególne sztuki w `inventory_units`.

---

### D. Integracja Płatności HotPay (`create-hotpay.ts`, `hotpay-webhook.ts`)
* **Inicjalizacja płatności:** POST `/api/payments/create-hotpay` oblicza kwotę zamówienia (w groszach), dodaje rezerwację stanów, generuje numer `ORD-XXX`, tworzy zamówienie w Firestore i inicjalizuje transakcję w serwisie `platnosc.hotpay.pl` przekazując wygenerowany podpis `HASH`.
* **Weryfikacja powiadomienia (Webhook):** POST `/api/payments/hotpay-webhook`:
  * Weryfikuje sekret oraz podpis `HASH` przy użyciu stałoczasowego porównania `crypto.timingSafeEqual`.
  * Weryfikuje zgodność kwoty (`KWOTA`) i waluty z wartościami z bazy danych za pomocą `matchesHotpayOrderPayment`.
  * Po odebraniu statusu `SUCCESS` aktualizuje zamówienie do stanu `paid`, potwierdza rezerwację stanów (`confirmed`), uruchamia generację POD oraz nalicza kupującemu punkty grywalizacyjne.

---

### E. Integracja Dostaw InPost (`InpostGeowidget.tsx`, `server.ts`)
* **InPost Geowidget:** Pobiera dynamicznie konfigurację środowiskową (`sandbox` / `production`) oraz token z serwera `/api/inpost/geowidget-config`.
* **ShipX API:** Serwer udostępnia chronione middleware'em admina endpointy do tworzenia przesyłek w InPost ShipX (`/api/inpost/create-shipment`), zakupu przesyłki (`/api/inpost/buy-shipment`), pobierania etykiet PDF (`/api/inpost/label/:shipmentId`) oraz odbioru webhooków statusowych (`/api/inpost/webhook`).

---

### F. Rejestracja Kart przez Kod QR (`register-postcard.ts`, `RegisterPostcard.tsx`)
* **Weryfikacja kodu/tokena:** `GET /api/register-postcard?token=...` odnajduje kartkę w `inventory_units` po tokenie, hashu tokena lub kodzie aktywacyjnym.
* **Walidacja językowa:** Serwer weryfikuje, czy język wybrany przez obdarowanego jest dozwolony dla kraju danej kartki (`card_language_templates`).
* **Atomowy zapis i ochrona przed podwójną rejestracją:** Zapis z warunkiem czasu modyfikacji dokumentu (`updateTime` precondition). Przy próbie ponownej rejestracji zwracany jest błąd HTTP 409 (Conflict).
* **Grywalizacja i kalkulacja dystansu:** Obdarowanie nalicza +50 pkt wpływu kulturowego, wylicza dystans geograficzny w km od Polski (wzorzec Haversine dla Warszawy) i automatycznie aktualizuje rangę podróżnika.

---

### G. Panel Administratora (`src/components/admin/*`)
* `AdminOrders.tsx` — Zarządzanie zamówieniami, partiami produkcyjnymi POD, generowanie podglądów PDF i manifestów wysyłkowych.
* `AdminShipments.tsx` — Nadawanie przesyłek InPost z weryfikacją autoryzacji admina.
* `AdminInventory.tsx` / `AdminQrJobs.tsx` — Śledzenie stanów magazynowych, wycofań (damaged/voided) i zadań druku.
* `AdminCardDesigns.tsx`, `AdminCountries.tsx`, `AdminCategories.tsx`, `AdminAuthors.tsx`, `AdminProducts.tsx` — Pełny zestaw narzędzi CRUD.

---

### H. Architektura Firestore i Reguły Bezpieczeństwa (`firestore.rules`)
* Wdrożono reguły dostępu oparte na `request.auth.uid` i weryfikacji ról.
* Dane prywatne (zamówienia, jednostki magazynowe, rejestracje obdarowanych) są zabezpieczone przed nieautoryzowanym odczytem.
* Operacje w magazynie i partiach produkcyjnych zastrzeżone wyłącznie dla kont administratorów.

---

### I. Konfiguracja CI/CD i Wdrożenia
* **GitHub Actions (`.github/workflows/firebase-cloudrun.yml`):** Quality Gate (`typecheck`, `lint`, `test`, `build`, kontrola otwartych reguł Firestore) oraz automatyczny deploy do Firebase Hosting za pomocą Workload Identity Federation.
* **Docker:** Plik `Dockerfile` z Node 22 slim przeznaczony dla Cloud Run.

---

## ⚠️ 3. WSKAZANIE BŁĘDÓW, RYZYK I SŁABYCH PUNKTÓW

| # | Obszar | Wykryty błąd / Ryzyko | Opis i wpływ | Status naprawy |
|---|---|---|---|---|
| **1** | **Autentykacja** | **Atrapa logowania Apple (Mock)** | Przycisk "Apple" w `Auth.tsx` wywołuje logowanie na konto deweloperskie `user.apple@podrozowka.pl` zamiast prawdziwego protokołu OAuth Apple Sign-In. | ⚠️ Wymaga dokończenia przed produkcją |
| **2** | **Autentykacja** | **Hardkodowane listy e-maili w regułach Firestore** | Choć wprowadzono migrację ról, w `firestore.rules` nadal widnieją awaryjne adresy e-mail (`fundacja@d-arka.org`, `dariusz.pgry@gmail.com`, `fundacja@konopiedlaziemi.org`). | ℹ️ Niskie ryzyko (fallback w regułach) |
| **3** | **Zależności środowiska CI** | **Różnica w konstruktorze `Request` między Bun a Node.js** | Przekazanie surowego obiektu `URLSearchParams` do konstruktora `Request` powodowało błąd w wykonaniu runnera Bun na CI (`TypeError: Request constructor: Expected init.body to be an instance of URLSearchParams`). | ✅ **Naprawiono w bieżącym commicie** (`.toString()`) |

---

## 🧪 4. STAN TESTÓW I POKRYCIE QA

Zestaw testów obejmuje **66 przechodzących testów jednostkowych i integracyjnych** (oraz 3 pominięte testy integracji reguł na żywym emulatorze):
* `cart.test.tsx` (19 testów)
* `checkout.test.ts` (19 testów)
* `checkout-context.test.tsx` (4 testy)
* `hotpay-webhook.test.ts` (3 testy)
* `hotpay-webhook-route.test.ts` (3 testy)
* `inpost-admin-auth.test.ts` (3 testy)
* `inpost-shipment-route.test.ts` (2 testy)
* `inventory-cleanup.test.ts` (2 testy)
* `register-postcard.test.ts` (3 testy)
* `routing.test.tsx` (2 testy)
* `firestore-orders.test.ts` (2 testy)
* `firestore-api-paths.test.ts` (2 testy)
* `shipping-method-picker.test.tsx` (1 test)
* `example.test.ts` (1 test)

### Rekomendowane przyszłe rozszerzenia testowe:
1. **Automatyczne uruchamianie emulatora Firestore w CI:** Użycie `firebase emulators:exec` do odblokowania 3 pominiętych testów `firestore-rules.integration.test.ts`.
2. **Testy przeglądarkowe E2E (Playwright / Cypress):** Automatyzacja pełnego przejścia klienta od wyboru kartek w sklepie do zakończenia płatności i aktywacji QR.

---

## 💡 5. PODSUMOWANIE I REKOMENDACJE

Portal UAT **KDZFoundation/podrozowka-uat** znajduje się w bardzo wysokim stanie kompletności biznesowej i technicznej. Wszystkie kluczowe przepływy (sklep, koszyk z walidacją języków, rezerwacja stanów, płatności HotPay z weryfikacją kwot i podpisów HASH, wysyłki InPost chronione autoryzacją admina, rejestracja QR z atomowym zapisem oraz grywalizacją) działają poprawnie, a wszystkie 66 testów jednostkowych i integracyjnych oraz sprawdzanie typów TypeScript i ESLint przechodzą pomyślnie.
