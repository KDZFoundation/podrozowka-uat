# Raport Weryfikacji Build i Deploy Projekty Podróżówka (UAT & Produkcja)

**Data audytu:** 2026-08-29
**Audytor:** Jules (Adversarial Engineering & Build Reproducibility Audit)
**Środowisko testowe:** Ubuntu 24.04.4 LTS (Noble Numbat), Linux 6.6.137+
**Zakres:** Read-only audit powtarzalności buildów, automatyzacji CI/CD, konfiguracji Firebase, Vercel, reguł i indeksów Firestore oraz gotowości wdrożeniowej dla UAT i produkcji (`podrozowka.pl`).

---

## 1. Weryfikacja Punktu Odniesienia

### Git & Commit Verification
- **Wykonano `git fetch origin`**: Potwierdzono spójność z repozytorium zdalnym.
- **Weryfikowany commit SHA**: `cbbc31531472c47ef851f050cf995e95a8913931` (HEAD `origin/main`).
- **Tytuł commita**: `test: verify pod lease fencing in firestore emulator`
- **Stan drzewa roboczego**: Czyste (`working tree clean`).

### Środowisko Robocze i Narzędzia Lokalny / Runner
| Narzędzie | Wersja w środowisku auditowym | Stan w `package.json` / Workflows |
| :--- | :--- | :--- |
| **OS** | Ubuntu 24.04.4 LTS (x86_64) | `ubuntu-latest` (GitHub Actions) |
| **Node.js** | `v22.22.1` | setup-node `node-version: 22` |
| **npm** | `11.11.0` | Brak deklaracji w `engines` |
| **npx** | `11.11.0` | N/A |
| **Bun** | `1.2.14` | setup-bun `bun-version: latest` |
| **Firebase CLI** | `15.28.1` | `npx --yes firebase-tools@latest` |

### Lockfile i Obowiązujący Manager Pakietów
- **Obecne pliki lock**: Obecny jest wyłącznie `bun.lock` (328 090 bajtów).
- **Brakujące pliki lock**: Brak `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`.
- **Faktycznie obowiązujący package manager**: **Bun** (ze względu na obecność `bun.lock` i użycie w GitHub Actions).
- **Konfiguracja w `package.json`**: Brak pól `"packageManager"` oraz `"engines"` (brak wymuszenia wersji Node/Bun przez plik manifestu).

---

## 2. Powtarzalność Instalacji Zależności

1. **`npm ci` – Bezpośrednia Porażka (Exit Code 1)**:
   - Wywołanie `npm ci` kończy się błędem `EUSAGE`: *The `npm ci` command can only install with an existing package-lock.json or npm-shrinkwrap.json*.
   - Projekt jest nieinstalowalny standardowym narzędziem Node.js (`npm ci`), co uniemożliwia tradycyjne potoki CI oparte na `npm`.
2. **Środowisko Bun & `bun install --frozen-lockfile`**:
   - W GitHub Actions wywoływane jest `bun install --frozen-lockfile`. Bun potrafi odczytać plik tekstowy `bun.lock`.
3. **Przypięcie narzędzi produkcyjnych i CLI**:
   - **`firebase-tools`**: Pobierane dynamicznie w CI za pomocą `npx --yes firebase-tools@latest`. Brak przypięcia do konkretnej wersji stwarza ryzyko nagłego breaking change podczas wdrożenia.
   - **Bun**: W CI skonfigurowany jako `bun-version: latest` (brak przypięcia patch/minor version).
   - **Zależności w `package.json`**: Kluczowe narzędzia i biblioteki (`vite`, `typescript`, `vitest`, `firebase-admin`, `express`, `firebase`) mają prefiks `^` (np. `^5.4.19`, `^5.8.3`), co przy odtworzeniu lockfile lub instalacji na nowo pozwala na dryf wersji.
4. **Instalacja w świeżym środowisku bez `node_modules`**:
   - Przy braku `node_modules` instalacja powodzi się wyłącznie przy użyciu `bun install`. Narzędzia `npm` oraz `pnpm` nie posiadają lockfile.

---

## 3. Pełna Automatyczna Weryfikacja (Wyniki i Exit Codes)

Wszystkie polecenia zostały wykonane w lokalnym środowisku testowym.

| Polecenie | Exit Code | Wynik / Liczba testów | Uwagi |
| :--- | :---: | :--- | :--- |
| `npm ci` | **1** | **FAIL** (EUSAGE) | Brak `package-lock.json`. |
| `npm run typecheck` | **0** | **PASS** | `tsc --noEmit` zakończony sukcesem. |
| `npm run lint` | **0** | **PASS (12 ostrzeżeń)** | 0 błędów, 12 ostrzeżeń ESLint (`react-refresh/only-export-components`, `react-hooks/exhaustive-deps`). |
| `npm test` | **0** | **PASS** (89 passed, 4 skipped) | **Test files:** 22 passed, 2 skipped (łącznie 24).<br>**Tests:** 89 passed, 4 skipped (łącznie 93). |
| `npm run test:integration` | **0** | **PASS** (4 passed) | Uruchomiono emulatory Firebase (Auth & Firestore CLI v15.28.1, jar v1.22.0).<br>**Tests:** 4 passed, 0 failed. |
| `npm run build` | **0** | **PASS** | Vite v5.4.21 + esbuild. Wygenerowano `dist/index.html` oraz `dist/server.cjs` (78.3 kB). High chunk size warnings (>500 kB). |

### Podsumowanie Liczby Testów
- **Statyczne unit / component tests (`npm test`)**: Passed: **89**, Failed: **0**, Skipped: **4**.
- **Integracyjne Firestore Emulator (`npm run test:integration`)**: Passed: **4**, Failed: **0**, Skipped: **0**.
- **Suma testów w repozytorium**: **93 passed**, **0 failed**, **4 skipped** (z 97 ogółem).

---

## 4. Analiza GitHub Actions (`.github/workflows/firebase-cloudrun.yml`)

1. **Nazwa workflow vs Rzeczywiste Działanie**:
   - Workflow nazywa się `Firebase Hosting` (plik `firebase-cloudrun.yml`), ale **nie wdraża do Cloud Run**. Wdraża wyłącznie do Firebase Hosting, Firestore Rules i Firestore Indexes.
2. **Kolejność kroków i Quality Gate**:
   - Job `quality` wykonuje: `Reject insecure Firestore rules` -> `typecheck` -> `lint` -> `test` -> `build`.
   - **Brak testów integracyjnych w CI**: Job `quality` uruchamia `bun run test` (który pomija 2 pliki testów integracyjnych w emulatorze przez `process.env.RUN_FIRESTORE_INTEGRATION`). Testy `test:integration` **nie są wykonywane w GitHub Actions**!
3. **Wdrożenie i Blokada**:
   - Job `deploy` zależy od `needs: quality`. Jeżeli unit testy nie przejdą, deploy jest blokowany. Jednak ze względu na brak `test:integration` w pipeline, błędy reguł Firestore nie zablokują deployu w CI.
4. **Brak Rozróżnienia UAT vs Produkcja**:
   - W workflow zahardkodowano: `FIREBASE_PROJECT_ID: podrozowka` oraz target Firebase `podrozowka-uat-one.vercel.app`.
   - Pipeline wdraża na gałęzi `main` konfigurację wskazaną jako UAT (`build:uat`), ale do projektu Firebase `podrozowka` (używanego jako projekt domyślny). Brak dedykowanego workflow produkcyjnego dla domeny `podrozowka.pl`.
5. **Użycie Nieprzypiętych Narzędzi (`@latest`)**:
   - Step deployu uruchamia: `npx --yes firebase-tools@latest deploy`. Brak determinizmu w wersji CLI wdrożeniowego.
6. **Workload Identity Federation**:
   - Używa `google-github-actions/auth@v2` z sekretami `GCP_WORKLOAD_IDENTITY_PROVIDER` oraz `GCP_SERVICE_ACCOUNT`. Konfiguracja poprawna pod względem braku długożyciowych kluczy w repozytorium.
7. **Rollback i Artefakty**:
   - Workflow nie zapisuje artefaktu z powiązanym commit SHA ani nie publikuje release tagów. Rollback wymaga ręcznego wywołania w konsoli Firebase lub ponownego uruchomienia starego workflow z GitHub Actions.

---

## 5. Firebase, Firestore i Hosting

1. **`firebase.json` Configuration**:
   - **Firestore Database ID**: `ai-studio-podrozowkauat-e1d9b39b-c759-477c-98ea-34396a1afd2f` (podane jawnie w `firebase.json`!).
   - **Hosting rewrites**:
     ```json
     {
       "source": "/api/**",
       "run": {
         "serviceId": "podrozowka-uat",
         "region": "us-west1"
       }
     }
     ```
     Rewrite wskazuje na serwis Cloud Run `podrozowka-uat` w `us-west1`.
2. **Wdrożeniowy Mismatch (Vercel vs Cloud Run)**:
   - W CI (`firebase-cloudrun.yml`) frontend budowany jest komendą `build:uat`, która przekazuje:
     `VITE_BACKEND_API_URL=https://podrozowka-uat-one.vercel.app`
   - Tymczasem w `firebase.json` rewrites dla `/api/**` są kierowane do GCP Cloud Run (`podrozowka-uat`).
   - Tworzy to sprzeczność architektoniczną: zapytania ze sztywno skonfigurowanych odwołań API idą do Vercel, a ruch na `/api/**` idący bezpośrednio do domeny Firebase Hosting próbuje trafić do Cloud Run!
3. **Indeksy Firestore (`firestore.indexes.json`)**:
   - Zdefiniowany jest tylko 1 indeks złożony dla `inventory_units` (`card_design_id` ASC, `inventory_serial_no` DESC).
   - W kodzie serwera i zwerifikowanych skryptach występują zapytania sortujące i filtrujące po wielokrotnych polach (np. `orders`, `shipments`). Brak pozostałych indeksów w pliku JSON może skutkować błędami `FAILED_PRECONDITION: The query requires an index` na żywej bazie w środowisku produkcyjnym, co ujawnia się dopiero w runtime.
4. **Kolejność Deployu Firebase**:
   - Polecenie `--only hosting,firestore:rules,firestore:indexes` wdraża komponenty współbieżnie. Jeżeli Firestore Index jest w stanie `BUILDING`, baza danych może odrzucać zapytania w runtime do czasu zakończenia budowania indeksu przez GCP.

---

## 6. Vercel, Cloud Run i Podwójna Infrastruktura

W projekcie istnieje aktywna **podwójna architektura backendowo-hostingowa**:

1. **Backend / API**:
   - **Vercel Serverless Function**: W pliku `package.json` zdefiniowano `build:vercel-api` (`node scripts/build-vercel-router.mjs`), który pakuje `server/vercel-router.ts` do `api/_router.cjs` dla Vercel. Live endpoint `https://podrozowka-uat-one.vercel.app/api/health` odpowiada ze statusem `200 OK` (Vercel Serverless).
   - **Cloud Run (GCP us-west1)**: `firebase.json` zawiera konfigurację rewrite do usługi Cloud Run `podrozowka-uat`.
2. **Frontend**:
   - **Firebase Hosting**: Serwuje frontend ze zbudowanego katalogu `dist` na `https://podrozowka.web.app`.
   - **Vercel**: Posiada plik `vercel.json` z rewrite SPA do `/index.html`.
3. **Ocena Ryzyka Podwójnej Infrastruktury**:
   - **Rozjechanie zmiennych środowiskowych**: Sekrety i konfiguracja (np. `HOTPAY_SECRET`, `INPOST_SHIPX_TOKEN`) muszą być utrzymywane równolegle w panelu Vercel i GCP Secret Manager / Cloud Run.
   - **Niespójne endpointy**: Jeśli backend na Vercelu zostanie zaktualizowany, a Cloud Run nie (lub odwrotnie), klienci korzystający z rewrites na Firebase Hosting mogą trafiać na stary backend.

---

## 7. Zmienne Środowiskowe i Sekrety

### Tabela Weryfikacji Zmiennych Środowiskowych

| Nazwa Zmiennej | Środowisko | Frontend / Backend | Secret / Config | Obowiązkowa / Opcjonalna | Zachowanie przy braku | Ryzyko ujawnienia client-side |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `VITE_FIREBASE_API_KEY` | UAT / PROD | Frontend | Config | Obowiązkowa | Fallback do domyślnej konfiguracji appletu | **Publiczny z definicji** (Vite embed) |
| `VITE_FIREBASE_PROJECT_ID` | UAT / PROD | Frontend | Config | Obowiązkowa | Fallback do "podrozowka" | Publiczny |
| `FIRESTORE_DATABASE_ID` | UAT / PROD | Backend | Config | Opcjonalna | Fallback do `ai-studio-podrozowkauat-...` | Brak |
| `HOTPAY_SECRET` | UAT / PROD | Backend | **Secret** | **Obowiązkowa (płatności)** | Błąd walidacji sygnatury webhooka HotPay | **Brak** (używany wyłącznie w backendzie Node/Vercel) |
| `HOTPAY_NOTIFICATION_PASSWORD`| UAT / PROD | Backend | **Secret** | **Obowiązkowa (płatności)** | Błąd autoryzacji powiadomień | **Brak** |
| `PAYMENT_BACKEND_API_URL` | UAT / PROD | Backend | Config | Opcjonalna | Fallback do `https://podrozowka-uat-one.vercel.app` | Brak |
| `INPOST_SHIPX_TOKEN` | UAT / PROD | Backend | **Secret** | Obowiązkowa (wysyłka) | Brak możliwości tworzenia etykiet InPost | **Brak** |
| `INPOST_SHIPX_ORGANIZATION_ID`| UAT / PROD | Backend | Config | Obowiązkowa (wysyłka) | Brak możliwości obsługi przesyłek | Brak |
| `INPOST_SHIPX_ENV` | UAT / PROD | Backend | Config | Opcjonalna | Fallback do `"sandbox"` | Brak |
| `VITE_INPOST_GEOWIDGET_TOKEN` | UAT / PROD | Frontend | Config / Secret | Opcjonalna | Wyświetlenie ostrzeżenia / fallback do podstawowej mapy | **Publiczny w bundle** |
| `RESEND_API_KEY` | UAT / PROD | Backend | **Secret** | Opcjonalna (kontakt) | Brak wysyłki maili kontaktowych | **Brak** |
| `CONTACT_FROM_EMAIL` | UAT / PROD | Backend | Config | Opcjonalna | Fallback do braku nadawcy / błąd Resend | Brak |
| `CONTACT_TO_EMAIL` | UAT / PROD | Backend | Config | Opcjonalna | Fallback do `kontakt@podrozowka.pl` | Brak |
| `VITE_PUBLIC_APP_URL` | UAT / PROD | Frontend | Config | Opcjonalna | Fallback do `window.location.origin` | Publiczny |
| `VITE_BACKEND_API_URL` | UAT / PROD | Frontend | Config | Opcjonalna | Względne odwołania do `/api` | Publiczny |
| `VITE_SUPABASE_URL` | Historyczna | Frontend | Config | Opcjonalna | Fallback do pustego ciągu | Publiczny |
| `VITE_SUPABASE_PUBLISHABLE_KEY`| Historyczna | Frontend | Config / Secret | Opcjonalna | Fallback do pustego ciągu | Publiczny |

*Uwaga: W plikach źródłowych (np. `src/integrations/supabase/client.ts`) nadal znajdują się wywołania do zmiennych Supabase oraz P24 (`VITE_P24_MERCHANT_ID`, `VITE_P24_API_KEY`), mimo że projekt przeszedł na Firebase i HotPay.*

---

## 8. Smoke Test Wdrożenia UAT (Non-Destructive)

Wykonano zapytania HTTP typu HEAD/GET do żywych endpointów środowiska UAT:

1. **Frontend (`https://podrozowka.web.app/`)**:
   - **HTTP Status**: `200 OK`
   - **Content-Type**: `text/html; charset=utf-8`
   - **Zbudowany JS asset**: `assets/index-B3kE3Oe2.js` załadowany poprawnie.
2. **Backend UAT API Health Check (`https://podrozowka-uat-one.vercel.app/api/health`)**:
   - **HTTP Status**: `200 OK`
   - **Body Response**: `{"status":"ok","service":"podrozowka-uat-api","timestamp":"2026-08-29T13:17:26.794Z"}`
3. **InPost Geowidget Config (`https://podrozowka-uat-one.vercel.app/api/inpost/geowidget-config`)**:
   - **HTTP Status**: `200 OK`
   - **Body Response**: Zwraca token JWT InPost w trybie `"environment":"sandbox"`.
4. **Niewdrożone Endpointy (np. Orlen Widget)**:
   - **HTTP Status**: `404 NOT_FOUND` na trasie `/api/orlen/widget-config`.

---

## 9. Gotowość do Produkcji (Readiness Matrix)

| Obszar | Status | Podsumowanie / Uzasadnienie |
| :--- | :---: | :--- |
| **Deterministyczność instalacji** | **FAIL** | Brak `package-lock.json`, `npm ci` kończy się błędem. Wykorzystywany `bun.lock` nie jest egzekwowany przez `engines` ani `packageManager`. |
| **Deterministyczność builda** | **PARTIAL** | Vite i Bun budują poprawnie, ale wersje CLI w GitHub Actions (`firebase-tools@latest`, `bun-version: latest`) nie są przypięte. |
| **Kompletność testów** | **PARTIAL** | Testy integracyjne Firestore (`npm run test:integration`) są pomijane w GitHub Actions CI. |
| **Bezpieczeństwo sekretów** | **PASS** | Brak wycieku kluczy prywanych w kodzie. HotPay i InPost sekrety znajdują się po stronie serwera. |
| **Poprawność IAM** | **PASS** | Użycie GCP Workload Identity Federation w GitHub Actions. Reguły Firestore blokują anonimowy zapis. |
| **Wdrażanie Firestore Rules** | **PASS** | Reguły Firestore są weryfikowane pod kątem braku `allow read, write: if true` i wdrażane automatycznie. |
| **Wdrażanie Firestore Indexes** | **PARTIAL** | Plik `firestore.indexes.json` zawiera tylko 1 indeks. Zapytania produkcyjne mogą wymagać nieujawnionych indeksów. |
| **Strategia Rollback** | **FAIL** | Brak automatycznej strategii rollbacku i brak rejestracji artefaktów z tagami release. |
| **Rozdzielenie UAT / PROD** | **FAIL** | W workflow CI na sztywno wpisano projekt `podrozowka` i URL UAT Vercel. Brak osobnego pipeline dla produkcji (`podrozowka.pl`). |
| **Odtwarzalność z commita** | **PARTIAL** | Odtwarzalny kod źródłowy, ale instalacja zależności zależna od zewnętrznego stanu rejestrów bez locked npm manifestu. |

---

## 10. Szczegółowy Raport Problemów (P0–P3)

### [P0] Brak `package-lock.json` i Awaria Standardowej Instalacji (`npm ci`)
- **Plik i linia**: Korzeń projektu / `package.json`
- **Dowód**: Wykonanie `npm ci` zwraca `npm error code EUSAGE` (brak `package-lock.json`).
- **Kroki odtworzenia**: Run `npm ci` w świeżo sklonowanym repozytorium.
- **Aktualne zachowanie**: Projekt nie wspiera standardowych narządzi instalacyjnych Node.js (`npm ci`).
- **Oczekiwane zachowanie**: Repozytorium zawiera spójny `package-lock.json` zgodny z `package.json` i deklaracją `packageManager`.
- **Wpływ biznesowy**: Krytyczne ryzyko braku odtwarzalności builda na runnerach CI oraz niemożność użycia standardowych audytów bezpieczeństwa `npm audit`.
- **Minimalna poprawka**: Wygenerowanie `package-lock.json` (`npm install --package-lock-only`) lub zmiana manifestu i skryptów na oficjalną standaryzację Bun.
- **Proponowany test regresji**: Krok w CI wykonujący `npm ci --dry-run` lub `bun install --frozen-lockfile` sprawdzający integralność lockfile.

---

### [P0] Brak Bazy Danych i Pipeline Wdrożeniowego dla Produkcji (`podrozowka.pl`)
- **Plik i linia**: `.github/workflows/firebase-cloudrun.yml:13`, `firebase.json:3`
- **Dowód**:
  `FIREBASE_PROJECT_ID` ustawiony na `podrozowka`, `firebase.json` podaje bazę:
  `"database": "ai-studio-podrozowkauat-e1d9b39b-c759-477c-98ea-34396a1afd2f"`.
- **Kroki odtworzenia**: Przegląd `.github/workflows/firebase-cloudrun.yml`.
- **Aktualne zachowanie**: Push do `main` wdraża kod z konfiguracją UAT do produkcyjnego projektu Firebase `podrozowka`, wskazując na bazę z identyfikatorem UAT.
- **Oczekiwane zachowanie**: Rozdzielenie projektów Firebase na `podrozowka-uat` oraz `podrozowka-prod` z osobnymi bazami Firestore i osobnym workflow wdrożeniowym dla domeny produkcyjnej.
- **Wpływ biznesowy**: Ryzyko pomylenia danych produkcyjnych klientów z danymi testowymi UAT lub nadpisania produkcyjnej bazy danymi testowymi.
- **Minimalna poprawka**: Utworzenie odrębnego projektu Firebase dla środowiska produkcyjnego, sparametryzowanie `database` ID oraz przygotowanie workflow `deploy-prod.yml`.
- **Proponowany test regresji**: Test CI weryfikujący, że zmienna `FIREBASE_PROJECT_ID` i `FIRESTORE_DATABASE_ID` dla buildu produkcyjnego nie zawierają frazy `uat`.

---

### [P1] Brak Wykonywania Testów Integracyjnych Firestore w GitHub Actions Pipeline
- **Plik i linia**: `.github/workflows/firebase-cloudrun.yml:45`
- **Dowód**: W jobie `quality` wywoływane jest `bun run test`. Skrypt `test` uruchamia `vitest run`, który pomija testy w `firestore-rules.integration.test.ts` oraz `firestore-commit-preconditions.integration.test.ts` z powodu braku flagi `RUN_FIRESTORE_INTEGRATION=1`.
- **Kroki odtworzenia**: Sprawdzenie logów joba `quality` w GitHub Actions lub wykonanie `npm test` lokalnie.
- **Aktualne zachowanie**: Pipeline CI zalicza Quality Gate bez przetestowania reguł Firestore i mechanizmów fencingowych w emulatorze.
- **Oczekiwane zachowanie**: Job CI powinien uruchamiać `bun run test:integration` z użyciem Firebase Emulatora przed wdrożeniem.
- **Wpływ biznesowy**: Błędne reguły bezpieczeństwa Firestore mogą zostać opublikowane na środowisko produkcyjne, doprowadzając do wycieku danych lub zablokowania użytkowników.
- **Minimalna poprawka**: Dodanie kroku `- name: Integration Tests` uruchamiającego `bun run test:integration` w jobie `quality`.
- **Proponowany test regresji**: Test CI potwierdzający wykonanie co najmniej 4 testów integracyjnych w emulatorze Firestore.

---

### [P1] Niespójność Architektoniczna Rewrites: Firebase Hosting (Cloud Run) vs Frontend (Vercel API)
- **Plik i linia**: `firebase.json:17-22`, `.github/workflows/firebase-cloudrun.yml:62`
- **Dowód**:
  `firebase.json` przekierowuje `/api/**` do usługi Cloud Run `podrozowka-uat`:
  ```json
  "rewrites": [ { "source": "/api/**", "run": { "serviceId": "podrozowka-uat", "region": "us-west1" } } ]
  ```
  Z kolei CI buduje frontend poleceniem: `VITE_BACKEND_API_URL=https://podrozowka-uat-one.vercel.app bun run build:uat`.
- **Kroki odtworzenia**: Analiza zapytań sieciowych w aplikacji – część idzie do Vercel, a ruch bezpośredni do `https://podrozowka.web.app/api/` trafia do Cloud Run.
- **Aktualne zachowanie**: API działa na dwóch osobnych platformach bez wspólnej synchronizacji stanu i konfiguracji.
- **Oczekiwane zachowanie**: Jednoznaczna architektura backendowa (albo w całości Vercel Serverless, albo w całości Cloud Run / Firebase Functions).
- **Wpływ biznesowy**: Przenikanie się stanów, gubienie zmian w konfiguracji i trudności z diagnozowaniem awarii płatności/etykiet.
- **Minimalna poprawka**: Ujednolicenie docelowej infrastruktury backendowej i zaktualizowanie `firebase.json` lub zmiennych budowania frontendowego.
- **Proponowany test regresji**: Smoke test weryfikujący zgodność nagłówków odpowiedzi `/api/health` i adresu backendu.

---

### [P2] Dynamiczne, Nieprzypięte Wersje Narzędzi CLI i Dependencies w CI (`@latest`)
- **Plik i linia**: `.github/workflows/firebase-cloudrun.yml:25,67`
- **Dowód**: `bun-version: latest` oraz `npx --yes firebase-tools@latest deploy`.
- **Kroki odtworzenia**: Przegląd kroku setup w `.github/workflows/firebase-cloudrun.yml`.
- **Aktualne zachowanie**: Podczas każdego wdrożenia CI pobiera najnowsze dostępne wydanie `bun` i `firebase-tools`.
- **Oczekiwane zachowanie**: Narzędzia CLI są przypięte do konkretnych, przetestowanych wersji (np. `firebase-tools@15.28.1`, `bun-version: 1.2.14`).
- **Wpływ biznesowy**: Ryzyko nagłego uniemożliwienia wdrożeń lub uszkodzenia wdrożenia przez niekompatybilną aktualizację CLI u dostawcy zewnętrznego.
- **Minimalna poprawka**: Podmiana `@latest` na jawny numer wersji w pliku workflow.
- **Proponowany test regresji**: Statyczna analiza pliku workflow pod kątem obecności ciągu `@latest`.

---

### [P2] Brak Deklaracji `engines` i `packageManager` w `package.json`
- **Plik i linia**: `package.json:1-100`
- **Dowód**: Plik `package.json` nie zawiera sekcji `"engines"` ani `"packageManager": "bun@1.2.14"`.
- **Kroki odtworzenia**: Odczyt `package.json`.
- **Aktualne zachowanie**: Brak formalnej informacji dla deweloperów i narzędzi CI, jaka wersja Node/Bun jest wymagana do pracy z projektem.
- **Oczekiwane zachowanie**: `package.json` zawiera `"engines": { "node": ">=22.0.0", "bun": ">=1.2.0" }` oraz `"packageManager": "bun@1.2.14"`.
- **Wpływ biznesowy**: Niezgodności środowiskowe pomiędzy deweloperami lokalnymi a runnerami CI.
- **Minimalna poprawka**: Uzupełnienie pól w `package.json`.
- **Proponowany test regresji**: Weryfikacja obecności pól przez linter manifestów.

---

### [P3] Niepotrzebne Ostrzeżenia ESLint oraz Ostrzeżenia Rozmiaru Chunks w Vite Build
- **Plik i linia**: `src/components/ui/*.tsx`, `vite.config.ts`
- **Dowód**: 12 ostrzeżeń ESLint dotyczących Fast Refresh oraz ostrzeżenie Vite przy buildzie (`index-BhHBIkr2.js` osiąga **2.92 MB**).
- **Kroki odtworzenia**: Run `npm run lint` oraz `npm run build`.
- **Aktualne zachowanie**: Wygenerowany bundle frontendu zawiera potężny główny plik JavaScript (>2.9 MB uncompressed).
- **Oczekiwane zachowanie**: Podział kodu na mniejsze chunki (code splitting przez `manualChunks` lub dynamiczne importy).
- **Wpływ biznesowy**: Wydłużony czas ładowania pierwszej strony u klientów mobilnych na słabym łączu.
- **Minimalna poprawka**: Skonfigurowanie `manualChunks` dla dużych bibliotek (`recharts`, `leaflet`, `framer-motion`) w `vite.config.ts`.
- **Proponowany test regresji**: Weryfikacja limitu rozmiaru chunków w konfiguracji Vite.

---

## Werdykt i Zalecenia

### Werdykt dla dalszej pracy UAT: **GO WARUNKOWE**
- **Uzasadnienie**: Środowisko UAT obecnie działa (`https://podrozowka.web.app/` oraz `https://podrozowka-uat-one.vercel.app/api/health` odpowiadają poprawnie, a build UAT kończy się sukcesem). Dalsza praca testowa na UAT jest możliwa pod warunkiem świadomości braku wykonywania testów integracyjnych w CI.

### Werdykt dla domeny produkcyjnej `podrozowka.pl`: **NO-GO**
- **Uzasadnienie**: Projekt nie jest gotowy na wdrożenie produkcyjne pod domeną `podrozowka.pl`. Kluczowe powody blokujące:
  1. Brak deterministycznego instalatora dependencies (`npm ci` kończy się błędem z braku `package-lock.json`).
  2. Brak odrębnego projektu Firebase / Firestore dla środowiska produkcyjnego (obecna konfiguracja nakłada UAT na domyślny projekt `podrozowka`).
  3. Pomijanie testów integracyjnych reguł Firestore w automatycznym pipeline CI.
  4. Niespójna podwójna architektura (Vercel API vs GCP Cloud Run w `firebase.json`).

---

### Pięć Najważniejszych Działań Przed Produkcją

1. **Uporządkowanie i Przypięcie Dependencies (Lockfile)**:
   - Podjęcie decyzji o oficjalnym managerze pakietów (Bun vs npm) i wygenerowanie oraz zacommitowanie spójnego pliku lock (`package-lock.json` lub jednoznaczne egzekwowanie `bun.lock` z ustawieniem `"packageManager"` i `"engines"` w `package.json`).
2. **Utworzenie Dedykowanej Infrastruktury Produkcyjnej (PROD Isolation)**:
   - Utworzenie osobnego projektu w Firebase (np. `podrozowka-prod`) z osobną bazą Firestore.
   - Przygotowanie dedykowanego pliku workflow `.github/workflows/deploy-prod.yml` aktywowanego wyłącznie na wydaniach/tagach produkcyjnych.
3. **Dodanie Testów Integracyjnych do Pipeline CI**:
   - Włączenie `bun run test:integration` do joba `quality` w GitHub Actions, aby reguły Firestore i fencery były automatycznie testowane w emulatorze przed każdym wdrożeniem.
4. **Ujednolicenie Architektury Backendowej**:
   - Podjęcie decyzji, czy docelowym backendem produkcyjnym jest Vercel czy GCP Cloud Run, i usunięcie sprzecznych przekierowań z `firebase.json` oraz zmiennych builda.
5. **Weryfikacja Indeksów Firestore na Bazie Produkcyjnej**:
   - Przegląd wszystkich zapytań Firestore w kodzie źródłowym i uzupełnienie `firestore.indexes.json` o brakujące indeksy wielopolowe przed ruchem produkcyjnym.

---

### Lista Elementów Niezweryfikowanych (Out of Scope / Brak Dostępu)
- Fizyczna zawartość live bazy danych Firestore na GCP (dostęp read-only z poziomu kodu lokalnego; brak bezpośrednich danych uwierzytelniających do konsoli GCP w tym aucie).
- Ustawienia produkcyjnych domen DNS i certyfikatów SSL dla `podrozowka.pl`.
- Ustawienia sekretów w panelu Vercel Dashboard oraz GCP Secret Manager dla zmiennych produkcyjnych `HOTPAY_SECRET` oraz `INPOST_SHIPX_TOKEN`.

### Poziom Pewności Ustaleń
- **Weryfikacja lokalna (kod, build, testy, emulatory)**: **100% Pewności** (wykonano w odizolowanym środowisku Noble Numbat).
- **Analiza konfiguracji CI/CD i Firebase**: **100% Pewności** (przeanalizowano bezpośrednie pliki źródłowe workflow i manifestów).
- **Smoke test żywych endpointów UAT**: **100% Pewności** (potwierdzono nagłówki HTTP oraz odpowiedzi JSON live serwerów).
