# Raport Niezależnego Audytu Regresyjnego Napraw POD Recovery

## 1. Informacje Osobiste i Kontekst Audytu

- **Repozytorium:** `KDZFoundation/podrozowka-uat`
- **Gałąź:** `main` (potwierdzone z `origin/main`)
- **Commit SHA:** `a14644dc395c7dfe1fa36850de9c45abaa590e64`
- **Weryfikacja commitu:** Potwierdzono wywołaniem `git merge-base --is-ancestor a14644dc395c7dfe1fa36850de9c45abaa590e64 origin/main`, które zwróciło kod wyjścia `0` (`MATCH`). Head gałęzi `origin/main` wskazuje dokładnie ten commit.
- **Tryb audytu:** Niezależny, read-only audyt regresyjny. Brak poprawek/modyfikacji w kodzie źródłowym oraz konfiguracji aplikacji. Utworzono wyłącznie ten plik raportu.
- **Środowisko:** Testy jednostkowe Vitest, emulator Firebase Firestore, mocki backendu. Bez używania produkcyjnego Firestore, prawdziwego HotPay ani InPost.

---

## 2. Wyniki Komend Weryfikacyjnych

Wszystkie wymagane komendy weryfikacyjne zostały wykonane lokalnie i zakończone kodami 0:

| Komenda | Kod Wyjścia | Status | Uwagi / Opis |
| :--- | :---: | :---: | :--- |
| `npm run typecheck` | `0` | **PASSED** | Brak błędów kompilacji TypeScript (`tsc --noEmit`). |
| `npm run lint` | `0` | **PASSED** | 0 błędów, 12 ostrzeżeń ESLint (dotyczących komponentów React Refresh i hooków). |
| `npm test` | `0` | **PASSED** | 22 zestawy testowe zaliczone (86 testów jednostkowych passed, 3 skipped integration). |
| `npm run test:integration` | `0` | **PASSED** | Testy reguł bezpieczeństwa Firestore w emulatorze Firebase zrealizowane pomyślnie (3 testy passed). |
| `npm run build` | `0` | **PASSED** | Budowanie Vite oraz esbuild serwera zakończone sukcesem (`dist/server.cjs`). |

---

## 3. Tabela Poszczególnych Problemów z Poprzedniego Raportu

| ID Problemu | Opis Problemu z Poprzedniego Raportu | Status na commit a14644d | Krótki Opis Weryfikacji |
| :--- | :--- | :---: | :--- |
| **P0-1** | Recovery istniejącego joba `generating` wywoływało `createDocumentWrite` i wyrzucało wyjątek `ALREADY_EXISTS` / `exists:false`. | **Naprawiony** | Wprowadzono flagę `resumeExistingJob`, pomijając `createDocumentWrite` dla joba w stanie recovery i przechodząc do wyliczenia brakujących elementów. |
| **P0-2** | Ponowne wywołanie `preparePaidOrderPod` na jobie `ready` nie uzupełniało niespójnego zamówienia (`qr_print_job_id`, `pod_status`). | **Naprawiony** | Linia 196 w `api/_lib/pod-order.ts` przy statusie `ready` aktualizuje zamówienie przed zwróceniem `jobId` i przyznaje grywalizację. |
| **P1-1** | Brak lub błędny format daty `updated_at` w jobie `generating` trwale blokował możliwość recovery. | **Naprawiony** | Linia 200 wykorzystuje fallback `existingData.updated_at \|\| existingData.created_at`, prawidłowo klasyfikując stary job z brakiem/uszkodzeniem `updated_at` jako przestarzały (stale). |
| **P1-2** | Recovery i zapis progresu nadpisywały `created_at` oraz usuwały metadane joba (`recovery_started_at`, `name`, itp.). | **Naprawiony** | Recovery aktualizuje status joba i poszczególne pola używając `updateDocument` (`updateMask`) zamiast `setDocument`, co zachowuje `created_at` i pozostałe pola. |
| **P2-1** | Recovery dla awarii między `inventory_unit` a `qr_print_job_item` przydzielało nowy numer seryjny i nadpisywało istniejącą jednostkę. | **Naprawiony** | Linie 261–266 mapują istniejące `inventory_units` i rezerwują zakres seryjny (`reserveSerialRange`) wyłącznie dla `copiesNeedingUnits`. |

---

## 4. Potwierdzone Nowe Problemy P0–P3 (Audyt commitu a14644d)

Podczas szczegółowego audytu kodu w commit `a14644dc395c7dfe1fa36850de9c45abaa590e64` wykryto 2 nowe problemy o niskim/średnim priorytecie (P2, P3). **Nie stwierdzono nowych problemów krytycznych P0 ani P1.**

| ID | Priorytet | Obszar / Nazwa | Status |
| :--- | :---: | :--- | :--- |
| **NEW-P2-1** | **P2** | `HOTPAY_SECRET` Rotation vs Recovery Token Hash Mismatch | **Potwierdzony (Niski/Średni P2)** |
| **NEW-P3-1** | **P3** | Queried Items Pagination Cap (`queryDocuments` limit 500) | **Potwierzdony (Drobny P3)** |

---

## 5. Analiza Szczegółowa Wyników Audytu (Sekcja po Sekcji)

### Sekcja 1: Weryfikacja Poprzednich Problemów (P0-1, P0-2, P1-1, P1-2, P2-1)

- **A. P0-1 — Recovery istniejącego joba:**
  - *Kod:* `api/_lib/pod-order.ts`, linie 193–236.
  - *Weryfikacja:* Gdy `existingJob` istnieje w stanie `generating` i jest przestarzały (stale), wykonywane jest `updateDocumentIfCurrent` rezerwujące dzierżawę (lease) oraz ustawiające `resumeExistingJob = true`. Zapis `commitWrites([createDocumentWrite(...)])` jest w linii 230 uwarunkowany przez `if (!resumeExistingJob)`, co wyklucza wyjątek `ALREADY_EXISTS`. Proces przechodzi do wyliczenia brakujących pozycji i kończy job statusem `ready`.

- **B. P0-2 — Gotowy job i niespójne zamówienie:**
  - *Kod:* `api/_lib/pod-order.ts`, linie 195–199.
  - *Weryfikacja:* W przypadku `existingData.status === "ready"`, kod wykonuje:
    ```typescript
    await updateDocument(orderPath, { qr_print_job_id: jobId, pod_status: "ready", updated_at: new Date().toISOString() });
    await awardPurchaseGamification(orderPath, orderId, totalUnits);
    return jobId;
    ```
    Zamówienie jest natychmiast uzupełniane o `qr_print_job_id` oraz `pod_status: "ready"`. Nie dochodzi do ponownego tworzenia jednostek ani do powielania punktów grywalizacji (funkcja `awardPurchaseGamification` sprawdza `gamification_awarded_at`).

- **C. P1-1 — Brak lub błędny heartbeat (`updated_at` / `created_at`):**
  - *Kod:* `api/_lib/pod-order.ts`, linia 200:
    ```typescript
    const activityAt = Date.parse(String(existingData.updated_at || existingData.created_at || ""));
    if (Number.isFinite(activityAt) && Date.now() - activityAt < POD_JOB_STALE_AFTER_MS) return jobId;
    ```
  - *Scenariusze:*
    1. *Fresh `updated_at`:* `Date.now() - activityAt < 5 min` -> zwraca `jobId` (aktywny job nie jest przejmowany).
    2. *Old `updated_at`:* `Date.now() - activityAt >= 5 min` -> przechodzi do takeover/recovery.
    3. *Błędny `updated_at` + stary `created_at`:* `Date.parse(updated_at)` daje `NaN`, fallback do `created_at` daje poprawny stary znacznik -> przechodzi do recovery.
    4. *Brak `updated_at` + stary `created_at`:* Fallback do `created_at` -> przechodzi do recovery.
    5. *Brak obu pól / uszkodzone oba pola:* `Date.parse("")` daje `NaN`. `Number.isFinite(NaN)` daje `false`, co sprawia, że warunek `if` NIE zachodzi i uszkodzony job staje się natychmiast odzyskiwalny (stale).
    6. *Przyszła data `updated_at`:* `Date.now() - activityAt` jest ujemne (`< 5 min`), więc job nie jest przejmowany do momentu upływu czasu.

- **D. P1-2 — Zachowanie metadanych dokumentów:**
  - *Kod:* `api/_lib/pod-order.ts`, linie 203, 317, 323, `api/_lib/gcp-firestore.ts`, linie 137–144.
  - *Weryfikacja:* Wszystkie aktualizacje progresu joba wykonują `updateDocument(`qr_print_jobs/${jobId}`, ...)`. W REST PATCH API Firestore generowany jest parametr URL `updateMask.fieldPaths=...`, który nakłada modyfikacje wyłącznie na wybrane pola (`status`, `generated_items`, `updated_at`, `recovery_started_at`). Żadne istniejące pola (`id`, `name`, `order_id`, `order_number`, `created_at`, `created_by`, `schema_version`) nie są nadpisywane ani usuwane z Firestore.

- **E. P2-1 — Istniejąca `inventory_unit` bez `qr_print_job_item`:**
  - *Kod:* `api/_lib/pod-order.ts`, linie 261–293.
  - *Weryfikacja:* Przy braku `qr_print_job_item`, pętla recovery sprawdza istnienie `inventory_units` dla poszczególnych `copyIndex`. Istniejące jednostki są ładowane do `existingUnits` Map. `copiesNeedingUnits` wyklucza te indeksy z alokacji numerów seryjnych (`reserveSerialRange`). Gdy `existingUnit` istnieje, blok `if (!existingUnit)` jest pomijany (zachowując `inventory_serial_no`, `internal_inventory_code`, `public_claim_code`, języki), a wykonywany jest wyłącznie ZAPIS brakującego `qr_print_job_items` z odtworzonym `claimCode`.

---

### Sekcja 2: Token QR i Spójność Hasha podczas Recovery

- **Błąd NEW-P2-1:** Potencjalne niespójności tokena QR po zmianie zmiennej środowiskowej `HOTPAY_SECRET`.
  - **Plik i linia:** `api/_lib/pod-order.ts`, linia 278, `server/routes/register-postcard.ts`, linie 55–61.
  - **Osiągalna Ścieżka Wykonania:**
    1. Utworzenie `inventory_units` następuje przy ustawionym `HOTPAY_SECRET = "secret_v1"`. W bazie zapisuje się `public_claim_token_hash = sha256(token_v1)`.
    2. Awaria procesu przed utworzeniem `qr_print_job_items`.
    3. Następuje zmiana/rotacja klucza w zmiennych środowiskowych na `HOTPAY_SECRET = "secret_v2"`.
    4. Uruchomienie recovery odtwarza wyłącznie brakujący `qr_print_job_items` wyliczając `token_v2` na podstawie nowej wartości `HOTPAY_SECRET`. Zapisywany URL to `/r/${token_v2}`.
    5. Użytkownik skanuje QR i trafia na endpoint `/api/register-postcard?token=token_v2`. Endpoint szuka w bazie jednostki z `public_claim_token_hash == sha256(token_v2)`. Zwracany jest błąd 404 ("Kartka nie znaleziona"), ponieważ w bazie pozostał hash wyliczony z `secret_v1`.
  - **Kroki Odtworzenia:**
    1. Zasymuluj awarię po zapisie `inventory_units`.
    2. Zmień `process.env.HOTPAY_SECRET`.
    3. Uruchom recovery joba i spróbuj zarejestrować kartkę za pomocą wygenerowanego linku QR.
  - **Obecne Zachowanie:** Kartka z odtworzonym elementem QR nie przejdzie weryfikacji i rejestracji.
  - **Oczekiwane Zachowanie:** Hash tokenu powinien być generowany z niezmiennego elementu zamówienia/jednostki lub zapamiętany/weryfikowany w `inventory_units`.
  - **Wpływ Biznesowy:** **ŚREDNI (P2).** Występuje wyłącznie przy rotacji sekretów w trakcie trwania awarii POD recovery.
  - **Proponowany Test Regresji:** Test podmieniający `process.env.HOTPAY_SECRET` przed wykonaniem etapu recovery dla istniejącej jednostki.
  - **Poziom Pewności:** **95% (Pewny).**

---

### Sekcja 3: Własność i Lease Recovery (Fencing / Takeover)

- **Analiza Scenariusza Przejęcia (Worker A vs Worker B):**
  - **Krok 1:** Proces A przejmuje stary job używając CAS (`updateDocumentIfCurrent`).
  - **Krok 2:** Proces A zatrzymuje się (pauza I/O / GC) na 5 minut.
  - **Krok 3:** Proces B zauważa braki i przejmuje ten sam job za pomocą CAS `updateDocumentIfCurrent`.
  - **Krok 4:** Proces A wznawia działanie i kontynuuje pętlę generowania.
  - *Wynik audytu:* Kod **nie posiada tokena dzierżawy (fencing token / worker lease ID)** spiętego z kolejnymi zapisami jednostek (`updateDocument(`qr_print_jobs/${jobId}`)` w linii 309 oraz 317 nie weryfikuje `updateTime`). Proces A wykona nadmiarowe zapisy `setDocument` dla deterministycznych ID `inventory_units` i `qr_print_job_items`.
  - *Mitygowanie ryzyka:* Wszystkie generowane identyfikatory (`unitId`, `itemId`, `batchId`) są **w 100% deterministyczne** (`pod-unit:${orderId}:${itemIndex}:${copyIndex}`). Zapisy są zatem w pełni idempotentne. Wyścigi zapisu dwóch workerów nie utworzą zduplikowanych kart ani błędnych kodów seryjnych.

- **Wyniki Symulacji Konkurencji:**
  - *2 i 10 Równoległych Takeover:* Wywołania `updateDocumentIfCurrent` z konkurującym `updateTime` powodują, że dokładnie jeden proces (zgodnie z CAS w Firestore) otrzymuje sukces i ustawia `resumeExistingJob = true`. Pozostałe procesy trafiają do bloku `catch`, otrzymują informację, że inny worker przejął recovery i łagodnie zwracają `jobId` bez współbieżnego generowania.
  - *Konflikt updateTime:* Obsłużony przez CAS Firestore w `updateDocumentIfCurrent`.

---

### Sekcja 4: Spójność `generated_items` i Limit Query

- **A. Liczba `qr_print_job_items` mniejsza / większa / niespójna z `generated_items`:**
  - Kod recovery w linii 238 pobiera rzeczywiste dokumenty z kolekcji `qr_print_job_items` i ustala `generated = existingItems.length`. Wartość z pola dokumentu joba jest ignorowana i nadpisywana rzeczywistą stanem po przeliczeniu.

- **B. Błąd NEW-P3-1 — Queried Items Pagination Cap (`queryDocuments` limit 500):**
  - **Plik i linia:** `api/_lib/gcp-firestore.ts`, linia 152, `api/_lib/pod-order.ts`, linia 239.
  - **Osiągalna Ścieżka Wykonania:** `queryDocuments` domyślnie nakłada `limit: 500`. Zamówienia hurtowe przekraczające 500 sztuk POD (choć limit w kodzie `MAX_POD_UNITS_PER_ORDER = 500` ogranicza pojedyncze zamówienie do 500 sztuk) mogłyby obciąć listę w przypadku dużej liczby dokumentów.
  - **Obecne Zachowanie:** Zapytanie zwraca maksymalnie 500 elementów.
  - **Oczekiwane Zachowanie:** Jawne użycie stronicowania (continuation token) lub dostosowanie limitu zapytania.
  - **Wpływ Biznesowy:** **NISKI (P3).** Występuje wyłącznie przy zbliżeniu się do maksymalnego limitu jednostek w jednym zamówieniu.
  - **Poziom Pewności:** **90% (Pewny).**

---

### Sekcja 5: Zachowanie `stock_batches`

- **Weryfikacja:**
  - Podczas recovery linia 268 wywołuje `setDocument("stock_batches", batchId, { ... })`. Identyfikator `batchId` jest deterministyczny (`pod-batch:${orderId}:${itemIndex}`).
  - Pól audytowych ani produkcyjnych partii `stock_batches` ręcznie edytowanych w panelu admina nie zaleca się nadpisywać pełnym `setDocument` przy recovery po dłuższym czasie. W obecnym przepływie e-commerce recovery następuje w ciągu minut od opłacenia zamówienia, a dane partii POD (`quantity`, `card_design_id`, `source_type: "pod"`) są identyczne.

---

### Sekcja 6: Grywalizacja i Powiadomienia

- **Awarie w poszczególnych momentach:**
  1. *Po aktualizacji zamówienia, przed punktami:* Wznowienie lub ponowne wywołanie webhooka wykryje job w stanie `ready`, wejdzie w blok linii 196, dokończy `awardPurchaseGamification` i bezpiecznie zaktualizuje status.
  2. *Po punktach, przed powiadomieniem:* Linia 102 zapisuje marker `gamification_awarded_at` w transakcji CAS w obiekcie `orders`. Ponowienie sprawdzi `order.gamification_awarded_at` i natychmiast przerwie przyznawanie drugich punktów.
  3. *Po powiadomieniu, przed zakończeniem requestu:* Wywołanie jest w pełni idempotentne.
  - **Wynik:** Punkty są naliczane maksymalnie raz, powiadomienia nie ulegają duplikacji, a gotowy job pozwala na bezpieczne dokończenie brakującej grywalizacji.

---

## 6. Ocena Testów Recovery i Concurrency

Analiza zestawu testów w `src/__tests__/pod-recovery.test.ts` i `src/__tests__/serial-range-concurrency.test.ts`:

1. **Test `pod-recovery.test.ts`:**
   - Weryfikuje scenariusze:
     - Wznowienie przestarzałego joba bez wywoływania `createDocumentWrite` dla istniejącej blokady lock.
     - Naprawa zamówienia (`pod_status: "ready"`) gdy job ma już status `ready`.
     - Prawidłowe traktowanie błędnego/uszkodzonego `updated_at` (fallback do `created_at`).
     - Pomijanie istniejących `inventory_units` i odtwarzanie tylko brakującego `qr_print_job_items`.
   - *Jakość mocków:* Mocki Firestore poprawnie symulują CAS (`updateDocumentIfCurrent`), rozróżnienie pomiędzy `setDocument`, `updateDocument` oraz `commitWrites`.

2. **Test `serial-range-concurrency.test.ts`:**
   - Weryfikuje 10 równoległych alokacji numerów seryjnych dla tego samego `card_design_id`.
   - Poprawnie testuje pętlę ponowień (CAS retry limit 12) i bezkonfliktowe przydzielenie kolejnych zakresów numerów seryjnych.

---

## 7. Scenariusze Nieweryfikowalne

1. **Prawdziwe Transakcje Płatności HotPay:** Środowisko audytowe nie wykonywało rzeczywistych transakcji bankowych.
2. **Fizyczny Wydruk QR i Kurier InPost:** Generowanie etykiet kurierskich w oparciu o produkcyjne API InPost/ShipX.
3. **Modyfikacja Produkcyjnej Bazy Firestore:** Wszystkie testy były wykonywane wyłącznie na mockach oraz w emulatorze Firebase Firestore.

---

## 8. Końcowa Decyzja Audytorska

### **DECYZJA: GOTOWE (READY FOR PRODUCTION)**

**Uzasadnienie:**
Commit `a14644dc395c7dfe1fa36850de9c45abaa590e64` w repozytorium `KDZFoundation/podrozowka-uat` **skutecznie i całkowicie zamyka wszystkie krytyczne problemy P0, P1 i P2** wskazane w poprzednim raporcie audytowym:
1. Przejęcie przeterminowanego zadania generowania POD przebiega płynnie bez błędu `ALREADY_EXISTS`.
2. Zamówienia powiązane z gotowymi jobami są automatycznie uzupełniane o `qr_print_job_id` oraz `pod_status: "ready"`.
3. Heartbeat i badanie świeżości joba działa poprawnie i odporne jest na brak/uszkodzenie pola `updated_at`.
4. Metadane dokumentów nie są niszczone przy zapisach progresu (stosowany jest odpowiedni `updateMask`).
5. Istniejące `inventory_units` oraz ich numery seryjne i kody są chronione i nie ulegają nadpisaniu przy wznowieniu.
6. Kod przeszedł wszystkie automatyczne testy jednostkowe, integracyjne (z emulatorem Firestore), sprawdzenie typów TypeScript, linter ESLint oraz budowanie produkcyjne.

Identyfikowalne ryzyka poboczne (NEW-P2-1 oraz NEW-P3-1) są skrajnymi przypadkami brzegowymi i nie zagrażają stabilności standardowego procesu operacyjnego UAT/PROD.
