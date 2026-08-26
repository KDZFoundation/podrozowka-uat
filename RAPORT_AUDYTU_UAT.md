# RAPORT AUDYTU KOMPLETNOŚCI PORTALU UAT — PODRÓŻÓWKA (`KDZFoundation/podrozowka-uat`)

**Data sporządzenia:** 2026-08-26
**Audytor:** Jules (Pair Programming Engineer)
**Środowisko:** `KDZFoundation/podrozowka-uat`
**Status zestawu testów:** 54 / 54 PASSED (`npm test`)
**Status kompilacji TypeScript:** PASSED (`npm run typecheck`)

---

## 📋 1. PODSUMOWANIE WYKONANAJ ANALIZY

Przeprowadzono pełną, wszechstronną analizę architektury, kodu źródłowego, konfiguracji i przepływów biznesowych w repozytorium **KDZFoundation/podrozowka-uat**. Repozytorium stanowi wersję UAT aplikacji wspierającej drukowanie, sprzedaż, wysyłkę oraz fizyczną rejestrację kartek pocztowych Podróżówka wraz z modułem grywalizacji i wpływu kulturowego.

W ramach audytu zweryfikowano:
1. **Strukturę aplikacji i architekturę (JAMstack + Cloud Serverless)**
2. **Autentykację i autoryzację (Firebase Auth + Firestore)**
3. **Koszyk i składanie zamówień (Print-On-Demand - POD)**
4. **Integrację bramki płatności HotPay**
5. **Integrację dostaw InPost (ShipX API & Geowidget)**
6. **Rejestrację kart pocztowych przez kod QR (`/r/:token`)**
7. **Panel Administratora (Admin Panel)**
8. **Reguły i architekturę bazy danych Google Cloud Firestore**
9. **Konfigurację wdrożenia (CI/CD, Docker, Firebase Hosting, Vercel)**
10. **Stan testów i pokrycie QA (Vitest)**

---

## 🏗️ 2. OCENA KOMPLETNOŚCI POSZCZEGÓLNYCH OBSZARÓW

### A. Architektura Aplikacji i Logika Serwerowa
* **Frontend:** React 18 z bundlerem Vite 5, React Router DOM v6, Tailwind CSS oraz komponenty Shadcn UI (Radix UI). Kod jest w pełni otypowany w TypeScript (`tsc --noEmit` przechodzi bez błędów).
* **Backend Bridge / API:** Dwa główne środowiska uruchomieniowe API:
  1. **Express Server (`server.ts`):** Kompletny serwer Node.js z obsługą tras API (`/api/payments/create-hotpay`, `/api/payments/hotpay-webhook`, `/api/inpost/*`, `/api/register-postcard`).
  2. **Vercel Serverless Functions (`api/`):** Zbudowane skryptem `build-vercel-router.mjs` jako bezserwerowy router API.

---

### B. Przepływy Autentykacji i Autoryzacji (`useAuth.tsx`, `Auth.tsx`)
* **Logowanie/Rejestracja:** Oparte o Firebase Auth (e-mail/hasło oraz opcja logowania przez Google Popup).
* **Profil Użytkownika:** Automatycznie synchronizowany do kolekcji `users` w Firestore przy każdym zalogowaniu (`syncFirestoreProfile`).
* **Weryfikacja Roli Admina:**
  * W kodzie klienta rola admina weryfikowana jest na podstawie e-maila w zestawie `ADMIN_EMAILS` (`fundacja@d-arka.org`).
  * W regułach Firestore (`firestore.rules`) dostęp admina sprawdzany jest po tokenie (`request.auth.token.admin == true` / `request.auth.token.role == 'admin'`) oraz dopasowaniu adresu e-mail (`fundacja@d-arka.org`, `dariusz.pgry@gmail.com`, `fundacja@konopiedlaziemi.org`).

---

### C. Zamówienia i Koszyk (`CartContext.tsx`, `Checkout.tsx`, `pod-order.ts`)
* **Tożsamość pozycji w koszyku:** Dedykowana identyfikacja linii na podstawie wzoru kartki oraz wybranych języków (`cardDesignId::lang:primary+secondary`).
* **Reguła ilościowa:** Weryfikacja minimalnej ilości zamówienia (10 sztuk Podróżówek) wymuszana na poziomie koszyka, interfejsu checkout oraz endpointu płatności `/api/payments/create-hotpay`.
* **Automatyczna generacja jednostek magazynowych (POD - Print On Demand):**
  * Po opłaceniu zamówienia system automatycznie tworzy zadanie druku (`qr_print_jobs`), partię magazynową (`stock_batches`) oraz poszczególne sztuki w `inventory_units`.
  * Każda fizyczna sztuka otrzymuje unikalny kod `internal_inventory_code` (np. `PDZ-KRAKOW-00000001`), publiczny kod aktywacyjny `public_claim_code` (`QR-...`) oraz bezpieczny hash tokena SHA256 do skanowania QR.

---

### D. Integracja Płatności HotPay (`create-hotpay.ts`, `hotpay-webhook.ts`)
* **Inicjalizacja płatności:** POST `/api/payments/create-hotpay` oblicza kwotę zamówienia (w groszach), generuje unikalny numer `ORD-XXX`, tworzy dokument zamówienia w Firestore o statusie `pending` i inicjalizuje transakcję w serwisie `platnosc.hotpay.pl` przekazując wygenerowany podpis `HASH`.
* **Weryfikacja powiadomienia (Webhook):** POST `/api/payments/hotpay-webhook`:
  * Weryfikuje sekret oraz podpis `HASH` przy użyciu bezpiecznego porównania stałoczasowego (`crypto.timingSafeEqual`).
  * Po odebraniu statusu `SUCCESS` aktualizuje zamówienie w Firestore do stanu `paid` (`paid_at`), uruchamia tworzenie jednostek POD oraz nalicza kupującemu punkty grywalizacyjne.

---

### E. Integracja Dostaw InPost (`InpostGeowidget.tsx`, `server.ts`)
* **InPost Geowidget:** Pobiera dynamicznie konfigurację środowiskową (`sandbox` / `production`) oraz token z serwera `/api/inpost/geowidget-config`.
* **ShipX API:** Serwer udostępnia endpointy do tworzenia przesyłek w InPost ShipX (`/api/inpost/create-shipment`), zakupu przesyłki (`/api/inpost/buy-shipment`), pobierania etykiet PDF (`/api/inpost/label/:shipmentId`) oraz odbierania zdarzeń webhooka statusowego (`/api/inpost/webhook`).

---

### F. Rejestracja Kart przez Kod QR (`register-postcard.ts`, `RegisterPostcard.tsx`)
* **Weryfikacja kodu/tokena:** `GET /api/register-postcard?token=...` odnajduje kartkę w `inventory_units` po tokenie, hashu tokena lub kodzie aktywacyjnym.
* **Walidacja językowa:** Serwer weryfikuje, czy język wybrany przez obdarowanego jest dozwolony dla kraju danej kartki (`card_language_templates`).
* **Atomowy zapis i ochrona przed podwójną rejestracją:** Serwer używa zapisu z warunkiem weryfikacji czasu ostatniej modyfikacji dokumentu (`updateTime` precondition). Przy próbie ponownej rejestracji zwracany jest błąd HTTP 409 (Conflict).
* **Naliczanie punktów i dystansu:** Po udanej rejestracji podróżnik otrzymuje +50 pkt wpływu kulturowego, wyliczany jest dystans geograficzny w km od Polski (wzorzec Haversine dla Warszawy) i automatycznie aktualizowana jest ranga podróżnika (*Zwiadowca* $\rightarrow$ *Odkrywca* $\rightarrow$ *Ambasador* $\rightarrow$ *Misjonarz Kultury* $\rightarrow$ *Legenda Podróżówki*).

---

### G. Panel Administratora (`src/components/admin/*`)
Panel admina zawiera pełny zestaw narzędzi zarządczych:
* `AdminOrders.tsx` — Zarządzanie zamówieniami, tworzenie partii produkcyjnych POD, generowanie podglądów PDF dla drukarni oraz manifestów wysyłkowych.
* `AdminShipments.tsx` — Nadawanie przesyłek InPost, pobieranie etykiet adresowych PDF.
* `AdminInventory.tsx` / `AdminQrJobs.tsx` — Śledzenie stanów magazynowych, fizycznych jednostek, wycofań (damaged/voided) i zadań druku.
* `AdminCardDesigns.tsx`, `AdminCountries.tsx`, `AdminCategories.tsx`, `AdminAuthors.tsx`, `AdminProducts.tsx` — Pełne CRUD dla katalogu i referencji.
* `AdminIntegrations.tsx` — Weryfikacja gotowości połączeń API (HotPay, InPost, Orlen Paczka).

---

### H. Architektura Firestore i Reguły Bezpieczeństwa (`firestore.rules`)
* Wdrożono szczegółowe reguły dostępu oparte na `request.auth.uid` i weryfikacji ról.
* Dane prywatne (zamówienia, jednostki magazynowe, rejestracje obdarowanych) są zabezpieczone przed nieautoryzowanym odczytem innych użytkowników.
* Operacje zapisu w magazynie i partiach produkcyjnych zastrzeżone wyłącznie dla kont administratorów.

---

### I. Konfiguracja CI/CD i Wdrożenia
* **GitHub Actions (`.github/workflows/firebase-cloudrun.yml`):** Wykonuje Quality Gate (`typecheck`, `lint`, `test`, `build`, kontrola otwartych reguł Firestore) oraz automatyczny deploy do Firebase Hosting za pomocą Workload Identity Federation.
* **Docker:** Posiada produkcyjny plik `Dockerfile` z Node 22 slim.

---

## ⚠️ 3. WSKAZANIE BŁĘDÓW, RYZYK I SŁABYCH PUNKTÓW

| # | Obszar | Wykryty błąd / Ryzyko | Opis i wpływ |
|---|---|---|---|
| **1** | **Płatności HotPay** | **Brak weryfikacji kwoty i waluty w Webhooku** | `hotpay-webhook.ts` sprawdza poprawność podpisu `HASH`, ale **nie porównuje kwoty odebranej w webhooku (`KWOTA`) z rzeczywistą wartością zamówienia z bazy danych (`total_amount_grosze`)**. Istnieje ryzyko, że zmodyfikowany atak o niższej kwocie oznaczy zamówienie jako opłacone. |
| **2** | **Bezpieczeństwo API** | **Brak autoryzacji admina na endpointach InPost** | Endpointy `/api/inpost/create-shipment` oraz `/api/inpost/buy-shipment` w `server.ts` nie sprawdzają nagłówka autoryzacyjnego ani tokena sesji admina. Dowolna osoba znająca URL mogłaby wywołać płatne zamówienie przesyłki w InPost. |
| **3** | **Autentykacja** | **Hardkodowana lista e-maili administratorów** | Adres e-mail `fundacja@d-arka.org` jest wpisany "na sztywno" w kodzie reaktywnym (`useAuth.tsx`) oraz w regułach `firestore.rules`. Zmiana lub dodanie admina wymaga ponownej kompilacji i deployu aplikacji oraz reguł. |
| **4** | **Autentykacja** | **Atrapa logowania Apple (Mock)** | Przycisk "Apple" w `Auth.tsx` wywołuje logowanie na konto deweloperskie `user.apple@podrozowka.pl` zamiast prawdziwego protokołu OAuth Apple Sign-In. |
| **5** | **Magazyn / Zamówienia** | **Rezerwacja stanów dopiero po płatności** | System generuje jednostki magazynowe POD dopiero w procesie webhooka po płatności (`preparePaidOrderPod`). Przy braku wcześniejszej rezerwacji podczas checkoutu istnieje ryzyko przyjęcia płatności na produkt wycofany ze sprzedaży. |

---

## 🧪 4. BRAKUJĄCE TESTY I LUKI W POKRYCIU QA

Obecny zestaw testów (`npm test`) zawiera **54 przechodzące testy**:
* `cart.test.tsx` (19 testów)
* `checkout.test.ts` (19 testów)
* `checkout-context.test.tsx` (4 testy)
* `register-postcard.test.ts` (3 testy)
* `routing.test.tsx` (2 testy)
* `firestore-orders.test.ts` (2 testy)
* `firestore-api-paths.test.ts` (2 testy)
* `hotpay-webhook.test.ts` (1 test)
* `shipping-method-picker.test.tsx` (1 test)
* `example.test.ts` (1 test)

### Zidentyfikowane brakujące scenariusze testowe:
1. **Testy integracyjne dla InPost ShipX API:**
   * Brak testów jednostkowych/integracyjnych dla endpointów `/api/inpost/create-shipment`, `/api/inpost/buy-shipment` oraz `/api/inpost/label`.
2. **Testy błędów inicjalizacji HotPay (`create-hotpay.ts`):**
   * Brak testów sprawdzających zachowanie serwera w przypadku niedostępności API HotPay lub braku zmiennych środowiskowych `HOTPAY_SECRET`.
3. **Automatyczne testy reguł Firestore (`@firebase/rules-unit-testing`):**
   * Brak testów jednostkowych weryfikujących reguły bezpieczeństwa `firestore.rules` na emulatorze (sprawdzenie czy anonimowy użytkownik nie może czytać `orders` lub modyfikować `inventory_units`).
4. **Testy E2E (End-to-End):**
   * Brak testów przeglądarkowych (np. Playwright / Cypress) pokrywających pełną ścieżkę użytkownika: Przeglądanie sklepu $\rightarrow$ Dodanie 10 kartek $\rightarrow$ Wybór Paczkomatu $\rightarrow$ Inicjalizacja płatności $\rightarrow$ Skanowanie i rejestracja QR (`/r/:token`).
5. **Testy wyścigu / współbieżności przy rejestracji QR:**
   * Brak testów symulujących jednoczesne skanowanie tego samego kodu QR przez dwie różne osoby w celu zweryfikowania odporności na race condition (mimo obecności warunków `updateTime` w kodzie).

---

## 💡 5. REKOMENDACJE PRZED WDROŻENIEM PRODUKCYJNYM

1. **Weryfikacja kwoty w Webhooku HotPay:** Dodanie w `hotpay-webhook.ts` weryfikacji: `if (Number(amount) !== Number(order.total_amount_pln)) return new Response("amount mismatch", { status: 400 });`.
2. **Zabezpieczenie endpointów administracyjnych API:** Wdrożenie weryfikacji Firebase ID Token (`Bearer token`) w nagłówku HTTP dla trasy `/api/inpost/*` oraz akcji administracyjnych.
3. **Przeniesienie ról do Custom Claims / Firestore:** Zamiast hardkodowania adresów e-mail admina w `useAuth.tsx`, użycie custom claims Firebase Auth (`admin: true`) lub odczytu roli z dokumentu `users/{uid}`.
4. **Dokończenie logowania Apple OAuth:** Zamiana obecnego statycznego logowania `user.apple@podrozowka.pl` na produkcyjną integrację z Firebase Apple Provider.
5. **Uzupełnienie zestawu testów:** Dodanie testów dla API InPost oraz testów reguł Firestore.
