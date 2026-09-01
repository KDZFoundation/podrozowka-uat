# Raport z Audytu Mechanizmu Wznowienia POD i Alokacji Numerów Seryjnych

## 1. Informacje Osobiste i Kontekst Audytu

- **Repozytorium:** `KDZFoundation/podrozowka-uat`
- **Gałąź:** `main` (potwierdzone z `origin/main`)
- **Commit SHA:** `6a07078a01301b84c35fcc6923a386b3ebc37a91`
- **Status potoku git:** Commit został zweryfikowany na `origin/main` (komenda `git merge-base --is-ancestor 6a07078a01301b84c35fcc6923a386b3ebc37a91 origin/main` zwróciła kod 0).
- **Tryb audytu:** Niezależny, read-only audit. Brak modyfikacji kodu produkcyjnego aplikacji.

---

## 2. Wyniki Automatycznych Testów i Komend Weryfikacyjnych

Wszystkie wymagane komendy zostały wykonane w lokalnym środowisku testowym / emulatorze Firebase:

| Komenda | Kod Wyjścia | Status | Uwagi / Opis |
| :--- | :---: | :---: | :--- |
| `npm run typecheck` | `0` | **PASSED** | Brak błędów TypeScript (`tsc --noEmit`). |
| `npm run lint` | `0` | **PASSED** | 0 błędów, 12 ostrzeżeń ESLint (dotyczących komponentów React Refresh i hooków). |
| `npm test` | `0` | **PASSED** | 21 zestawów testowych zaliczonych (82 testy jednostkowe passed, 3 skipped integration). |
| `npm run test:integration` | `0` | **PASSED** | Testy reguł bezpieczeństwa Firestore w emulatorze Firebase zrealizowane pomyślnie. |
| `npm run build` | `0` | **PASSED** | Budowanie Vite oraz esbuild serwera zakończenia sukcesem (`dist/server.cjs`). |

---

## 3. Tabela Analizy Awarii w Poszczególnych Momentach Generowania

Poniższa tabela przedstawia wynik analizy ścieżek wykonania przy wznowieniu procesu generowania POD po awarii w poszczególnych momentach (zgodnie z sekcją 2 celu audytu):

| # | Moment Awarii Procesu | Zachowanie po Ponowieniu (`preparePaidOrderPod`) | Dokończenie Brakujących | Duplikaty Jednostek | Zgodność Danych i Języków | Ponowne Punktowanie | Spójność Statusu Zamówienia |
|---|---|---|:---:|:---:|:---:|:---:|:---:|
| 1 | Po utworzeniu `qr_print_jobs`, przed 1. jednostką | Próbuje podjąć recovery, ale **blokuje się na błędzie P0** (`createDocumentWrite`). Jeśli naprawić P0: generuje od 0. | TAK (po poprawce P0) | NIE | TAK | NIE | NIE (krytyczny błąd P0 w synchronizacji zamówienia) |
| 2 | Po `reserveSerialRange`, przed `stock_batches` | Traci wygenerowany zakres numerów (powstaje luka w numeracji), przydziela nowy zakres. | TAK | NIE | TAK | NIE | TAK |
| 3 | Po `stock_batches`, przed `inventory_unit` | `setDocument` nadpisuje batch, rezerwuje nowy zakres seryjny, tworzy jednostki. | TAK | NIE | TAK | NIE | TAK |
| 4 | Po `inventory_unit`, ale przed `qr_print_job_item` | **Problem P2**: Brak `qr_print_job_item` powoduje ponowne wygenerowanie i nadpisanie numeru seryjnego istniejącej `inventory_unit`. | TAK | NIE | TAK | NIE | TAK |
| 5 | Po `qr_print_job_item`, przed aktualizacją `generated_items` | Rozpoznaje istniejący `qr_print_job_item`, pomija go i tworzy wyłącznie brakujące. | TAK | NIE | TAK | NIE | TAK |
| 6 | Po częściowym wygenerowaniu pozycji (np. 3/10) | Wznowienie pobiera 3 istniejące elementy, wylicza `missingCopies` (7 szt.), generuje dokładnie brakujące. | TAK | NIE | TAK | NIE | TAK |
| 7 | Po wygenerowaniu wszystkich jednostek, przed statusem `ready` | Pętla brakujących sztuk jest pusta. Ustawia status `ready`, aktualizuje zamówienie i grywalizację. | TAK | NIE | TAK | NIE | TAK |
| 8 | Po statusem `ready` na jobie, przed aktualizacją zamówienia | **Problem P0**: Funkcja zwraca natychmiast `jobId` bez zaktualizowania zamówienia (`pod_status`, `qr_print_job_id`). | **NIE** | NIE | TAK | NIE | **NIE** (Zamówienie trwale niespójne) |
| 9 | Po aktualizacji zamówienia, przed naliczeniem grywalizacji | Funkcja `awardPurchaseGamification` wykonuje się atomowo CAS i nalicza punkty dokładnie raz. | TAK | NIE | TAK | NIE | TAK |
| 10 | Po naliczeniu punktów, przed powiadomieniem | Naliczenie punktów posiada znacznik `gamification_awarded_at`. Ponowienie pomija ponowne punkty. | TAK | NIE | TAK | NIE | TAK |

---

## 4. Potwierdzone Niezmienniki

1. **Deterministyczne Identyfikatory:**
   - `qr_print_jobs`: `deterministicId("pod-job:${orderId}")`
   - `stock_batches`: `deterministicId("pod-batch:${orderId}:${itemIndex}")`
   - `inventory_units`: `deterministicId("pod-unit:${orderId}:${itemIndex}:${copyIndex}")`
   - `qr_print_job_items`: `deterministicId("pod-job-item:${orderId}:${itemIndex}:${copyIndex}")`
   - **Gwarancja:** Identyfikatory są w 100% powtarzalne i uniemożliwiają fizyczne zwielokrotnienie dokumentów jednostek dla tego samego indeksu zamówienia i kopii.

2. **Obsługa Maksymalnego Limitu Jednostek (500 sztuk):**
   - Kod weryfikuje `totalUnits > MAX_POD_UNITS_PER_ORDER` (500) i wyrzuca błąd `order_exceeds_pod_unit_limit` przed rozpoczęciem tworzenia dokumentów.

3. **Idempotentność Grywalizacji (`awardPurchaseGamification`):**
   - Zastosowano warunek `if (!userId || order.gamification_awarded_at) return;` oraz atomowy transakcyjny zapis w Firestore z weryfikacją `updateTime`.
   - Punkty nie są przyznawane dwukrotnie przy powtórzonych wywołaniach webhooka HotPay.

4. **Wielowątkowa Alokacja Numerów Seryjnych (`reserveSerialRange`):**
   - Kod używa mechanizmu optimistic concurrency control (CAS) w Firestore z precondition `updateTime` lub `exists: false`.
   - Pętla do 12 ponowień (`MAX_SERIAL_RETRIES = 12`) zapobiega nakładaniu się zakresów seryjnych.

5. **Ochrona Długo Działających Jobów (Heartbeat):**
   - Podczas generowania każdej jednostki w pętli, dokument `qr_print_jobs` jest aktualizowany o `updated_at: new Date().toISOString()`.
   - Aktywny job generujący np. 200 kart z rzędu na bieżąco odświeża znacznik czasu, zapobiegając przejęciu go przez inny proces po 5 minutach.

---

## 5. Wykryte Problemy i Błędy (P0 – P2)

### BŁĄD P0-1: Całkowita blokada wykonania procedury recovery przez warunek `createDocumentWrite`
- **Plik i linie:** `api/_lib/pod-order.ts`, linie 202–237
- **Osiągalna ścieżka wykonania:**
  1. Istniejący job POD przerywa działanie w stanie `generating` i upływa > 5 minut.
  2. Inny proces wywołuje `preparePaidOrderPod(orderPath, orderNumber)`.
  3. Kod odczytuje `existingJob` i pomyślnie wygrywa blokadę takeover (`updateDocumentIfCurrent`), ustawiając `resumeExistingJob = true`.
  4. Wykonanie przechodzi do linii 232: `await commitWrites([createDocumentWrite(`qr_print_jobs/${jobId}`, job)]);`.
  5. Funkcja `createDocumentWrite` ustawia warunek wstępny Firestore `{ exists: false }`.
  6. Ponieważ dokument `qr_print_jobs/${jobId}` **już istnieje w Firestore**, baza odrzuca zapis zgłaszając błąd `ALREADY_EXISTS`.
  7. Kod wpada do bloku `catch (error)` w linii 233, wykonuje `readDocument("qr_print_jobs", jobId)` w linii 234, widzi że `concurrentJob?.fields` istnieje i **ZWRACA `jobId` W LINII 235**, przerywając całą procedurę recovery!
- **Kroki do odtworzenia:**
  1. Utwórz dokument `qr_print_jobs/pod-job-TEST` ze statusem `generating` i `updated_at` sprzed 10 minut.
  2. Wywołaj `preparePaidOrderPod("orders/TEST", "ORD-TEST")`.
  3. Zaobserwuj, że funkcja zwróci `jobId`, ale żaden brakujący element nie zostanie wygenerowany, a status joba się nie zmieni.
- **Obecne zachowanie:** Procedura recovery ulega natychmiastowemu przerwaniu w bloku catch podczas próby wykonania `createDocumentWrite`.
- **Oczekiwane zachowanie:** Jeśli `resumeExistingJob === true`, kod powinien pominąć krok `commitWrites([createDocumentWrite(...)])` i przejść bezpośrednio do dobudowywania brakujących elementów (`queryDocuments("qr_print_job_items", ...)`).
- **Wpływ biznesowy:** **KRYTYCZNY (P0).** Mechanizm wznowienia podnoszenia przerwanych zleceń POD w rzeczywistości NIE DZIAŁA i nigdy nie wygeneruje brakujących kart po awarii.
- **Proponowany test regresji:**
  Test jednostkowy/integracyjny, w którym dokument `qr_print_jobs` istnieje w stanie `generating` z nieaktualnym `updated_at`, po czym wywołanie `preparePaidOrderPod` z powodzeniem generuje brakujące jednostki `inventory_units` oraz `qr_print_job_items` i ustawia status joba na `ready`.
- **Poziom pewności:** **100% (Pewny).**

---

### BŁĄD P0-2: Brak naprawy stanu zamówienia (`qr_print_job_id` / `pod_status`), gdy job ma status `ready`
- **Plik i linie:** `api/_lib/pod-order.ts`, linie 196–200
- **Osiągalna ścieżka wykonania:**
  1. Proces generowania POD wygenerował wszystkie jednostki i ustawił status joba `qr_print_jobs` na `ready` (linia 330).
  2. Awaria następuje przed wykonaniem linii 343 (`updateDocument(orderPath, { qr_print_job_id: jobId, pod_status: "ready" })`).
  3. Webhook płatności lub skrypt naprawczy wywołuje ponownie `preparePaidOrderPod(orderPath, orderNumber)`.
  4. Kod odczytuje `existingJob` w linii 194.
  5. Linia 198: `if (existingData.status === "ready") await awardPurchaseGamification(...)`.
  6. Linia 199: `if (existingData.status !== "generating") return jobId;`.
  7. Funkcja natychmiast zwraca `jobId` bez zaktualizowania dokumentu zamówienia w Firestore!
- **Kroki do odtworzenia:**
  1. Utwórz job `qr_print_jobs/pod-job-TEST` ze statusem `ready`.
  2. Utwórz zamówienie `orders/TEST` bez pól `qr_print_job_id` oraz `pod_status`.
  3. Wywołaj `preparePaidOrderPod("orders/TEST", "ORD-TEST")`.
  4. Odczytaj `orders/TEST` – pole `pod_status` nadal nie istnieje.
- **Obecne zachowanie:** Zwraca `jobId` i pozostawia zamówienie w stanie niekompletnym (brak `pod_status = "ready"` oraz `qr_print_job_id`).
- **Oczekiwane zachowanie:** Przed zwrotem `jobId`, funkcja powinna zweryfikować czy zamówienie pod `orderPath` posiada poprawne pola `qr_print_job_id` oraz `pod_status: "ready"` i uzupełnić je w razie braku.
- **Wpływ biznesowy:** **KRYTYCZNY (P0).** Zamówienie klienta pozostaje bez wygenerowanego statusu POD w bazie, co uniemożliwia realizację wysyłki lub wydruk manifestu.
- **Proponowany test regresji:** Test sprawdzający przypadek joba w stanie `ready` i zamówienia bez `pod_status`. Ponowne wywołanie musi zaktualizować zamówienie.
- **Poziom pewności:** **100% (Pewny).**

---

### BŁĄD P1-1: Brak lub niepoprawny `updated_at` trwale blokuje możliwość wznowienia joba
- **Plik i linie:** `api/_lib/pod-order.ts`, linie 200–201
- **Osiągalna ścieżka wykonania:**
  ```typescript
  const updatedAt = Date.parse(String(existingData.updated_at || ""));
  if (!Number.isFinite(updatedAt) || Date.now() - updatedAt < POD_JOB_STALE_AFTER_MS) return jobId;
  ```
  1. Dokument joba został zapisany bez pola `updated_at` lub z niepoprawnym ciągiem znaków.
  2. `Date.parse(...)` zwraca `NaN`.
  3. `Number.isFinite(NaN)` zwraca `false`.
  4. `!Number.isFinite(updatedAt)` ewaluuje się do `true`.
  5. Warunek `if (!Number.isFinite(...) || ...)` zostaje spełniony i funkcja wykonuje `return jobId;`.
- **Kroki do odtworzenia:**
  1. Utwórz job `qr_print_jobs` ze statusem `generating` i brakiem pola `updated_at`.
  2. Wywołaj `preparePaidOrderPod`.
  3. Obsługa recovery zostanie pominięta.
- **Obecne zachowanie:** Brak lub uszkodzenie pola `updated_at` jest interpretowane jako "job jest świeży" i blokuje recovery.
- **Oczekiwane zachowanie:** Jeśli `updated_at` jest niepoprawny/nieobecny, system powinien użyć `created_at` jako fallbacku lub potraktować job jako przestarzały (stale).
- **Wpływ biznesowy:** **WYSOKI (P1).** Uszkodzone dokumenty nie mogą zostać podniesione automatycznie przez mechanizm renowacji.
- **Poziom pewności:** **100% (Pewny).**

---

### BŁĄD P1-2: Usuwanie `recovery_started_at` i nadpisywanie `created_at` podczas zapisu progresu
- **Plik i linie:** `api/_lib/pod-order.ts`, linie 215, 321, 330 oraz `api/_lib/gcp-firestore.ts`, linia 133
- **Osiągalna ścieżka wykonania:**
  1. Podczas przejmowania starych jobów linia 203 zapisuje pole `recovery_started_at` w Firestore.
  2. Następnie w linii 321 wykonywany jest `setDocument("qr_print_jobs", jobId, { ...job, ... })`.
  3. Implikacja `setDocument`: Wykonuje żądanie `PATCH` do REST API Firestore **bez nagłówka / parametru `updateMask`**.
  4. Zgodnie ze specyfikacją Firestore REST API, `PATCH` bez `updateMask` zastępuje całą zawartość dokumentu nowym obiektem.
  5. Obiekt `job` utworzony w linii 215 ustawia `created_at: now` (czas uruchomienia recovery, niszcząc oryginalny czas utworzenia joba) oraz **nie zawiera pola `recovery_started_at`**.
- **Obecne zachowanie:** Pierwotna data utworzenia `created_at` zostaje nadpisana datą recovery, a pole auditowe `recovery_started_at` zostaje całkowicie skasowane z dokumentu w Firestore.
- **Oczekiwane zachowanie:** Użycie `updateDocument` z `updateMask` lub zachowanie oryginalnego `created_at` oraz pola `recovery_started_at`.
- **Wpływ biznesowy:** **WYSOKI (P1).** Utrata spójności danych audytowych i statystyk produkcyjnych POD.
- **Poziom pewności:** **100% (Pewny).**

---

### BŁĄD P2-1: Zmiana numeru seryjnego istniejącej jednostki przy awarii między `inventory_unit` a `qr_print_job_item`
- **Plik i linie:** `api/_lib/pod-order.ts`, linie 239–242, 262–264
- **Osiągalna ścieżka wykonania:**
  1. Generowanie tworzy dokument `inventory_units/pod-unit:ORD:0:0` z numerem seryjnym `00000001`.
  2. Następuje awaria tuż przed zapisaniem odpowiadającego dokumentu `qr_print_job_items/pod-job-item:ORD:0:0`.
  3. Podczas recovery zapytanie `queryDocuments("qr_print_job_items", ...)` w linii 239 zwraca listę nie zawierającą tego elementu.
  4. Wyliczenie `missingCopies` w linii 262 uznaje kopię `0` za brakującą.
  5. Wywoływane jest `reserveSerialRange`, pobierając nowy numer seryjny (np. `00000002`).
  6. Linia 290 nadpisuje istniejący dokument `inventory_units/pod-unit:ORD:0:0` nowym numerem seryjnym (`00000002`).
- **Obecne zachowanie:** Istniejąca jednostka magazynowa ma zmieniony numer seryjny przy wznowieniu po awarii.
- **Oczekiwane zachowanie:** Recovery powinno weryfikować również istniejące `inventory_units` lub zachowywać ich przypisane numery seryjne.
- **Wpływ biznesowy:** **ŚREDNI (P2).** Ewentualna zmiana kodu QR / numeru seryjnego jednostki, jeśli została ona częściowo wyemitowana przed awarią.
- **Poziom pewności:** **95% (Pewny).**

---

## 6. Jakość i Ocena Testu Concurrency (`serial-range-concurrency.test.ts`)

Audytowany plik: `src/__tests__/serial-range-concurrency.test.ts`

### Ocena Szczegółowa Mocka i Weryfikacji:
1. **Co test faktycznie symuluje:**
   - Test poprawnie sprawdza zachowanie funkcji `reserveSerialRange` przy 10 równoległych wywołaniach z wykorzystaniem operacji `createDocumentWrite` (`exists: false`) oraz `updateDocumentWrite` z nagłówkiem wersji CAS (`updateTime`).
   - Mock odrzuca próby zapisu przy braku zgodności wersji `updateTime` (`stale_update_time`) oraz przy próbie ponownego utworzenia istniejącego dokumentu (`already_exists`).

2. **Gdzie test daje fałszywe poczucie bezpieczeństwa (Słabości testu):**
   - **Brak testów zakresów wielosztukowych:** Test wywołuje wyłącznie `reserveSerialRange("design-1", 1)`. Nie testuje rezerwacji paczek po N sztuk (np. 5, 10 sztuk na raz) ani mieszanych wielkości zakresów.
   - **Brak testów opóźnień i błędów sieciowych:** Mock nie symuluje chwilowych błędów Firestore (503, connection reset) ani asynchronicznych opóźnień I/O.
   - **Brak testu wyczerpania limitu ponowień (12 retry):** Test nie weryfikuje zachowania systemu przy skrajnej konkurencji exceeding `MAX_SERIAL_RETRIES`.
   - **Brak integracji z recovery:** Test sprawdza odosobnioną funkcję `reserveSerialRange`, a nie pełny cykl recovery w `preparePaidOrderPod` (gdzie leżą krytyczne błędy P0).

---

## 7. Ocena Zamknięcia Problemów P2 i P3 z Poprzedniego Raportu

- **P2 (Wyścigi alokacji numerów seryjnych / CAS w sekwencji):**
  - **Status:** **Faktycznie naprawione na poziomie sekwencji.** Logika w `reserveSerialRange` poprawnie stosuje transakcje CAS oraz pętlę 12 ponowień.
- **P3 (Brak idempotentności generowania POD i nakładanie się jobów):**
  - **Status:** **CZĘŚCIOWO NAPRAWIONE / NIEBEZPIECZNE.** Sam mechanizm blokady na `qr_print_jobs/${jobId}` oraz deterministyczne identyfikatory są poprawne architektonicznie, **JEDNAKZE wprowadzenie błędu P0-1 (abortowanie recovery na `createDocumentWrite`) uniemożliwia faktyczne działanie wznowienia**.

---

## 8. Scenariusze Nieweryfikowalne

Zgodnie z wytycznymi audytu i bezpieczeństwa środowiska UAT:
1. **Prawdziwe Płatności HotPay i Bramki Płatnicze:** Nie wykonywano fizycznych transakcji finansowych.
2. **Prawdziwe Zlecenia Kurierskie InPost / ShipX API:** Operacje kurierskie były testowane wyłącznie poprzez mocki.
3. **Modyfikacje Produkcyjnej Bazy Firestore:** Audyt przeprowadzono wyłącznie w oparciu o analizę kodu, testy jednostkowe Vitest oraz emulator Firebase Firestore.

---

## 9. Końcowa Decyzja Audytorska

### **DECYZJA: POPRAWKA NIEBEZPIECZNA / CZĘŚCIOWA**

**Uzasadnienie:**
Mimo że alokacja numerów seryjnych (`reserveSerialRange`) została poprawnie zabezpieczona przed wyścigami (CAS), a identyfikatory jednostek są deterministyczne, **mechanizm wznowienia (recovery) przerwanego generowania POD w obecnej postaci na komicie `6a07078a01301b84c35fcc6923a386b3ebc37a91` JEST CAŁKOWICIE BEZUŻYTECZNY I AWARYJNY**:

1. **Błąd P0-1** powoduje, że każde przejęcie przeterminowanego joba kończy się natychmiastowym przerwaniem procedury w bloku `catch` bez wygenerowania jakichkolwiek brakujących kart.
2. **Błąd P0-2** powoduje, że w przypadku awarii tuż przed aktualizacją zamówienia, kolejne wywołania funkcji nie naprawią dokumentu zamówienia w Firestore, pozostawiając klienta z opłaconym zamówieniem bez statusu POD.
3. Zapis zmian w Firestore uszkadza oryginalne metadane joba (`created_at`, `recovery_started_at`).

Wdrożenie obecnego kodu na produkcję stwarza ryzyko utraty spójności zamówień i trwałego zablokowania zadań POD po dowolnej mikro-awarii infrastruktury Vercel / Firestore.
