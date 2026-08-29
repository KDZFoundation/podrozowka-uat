# RAPORT WERYFIKACJI ADVERSARIALNEJ COMMITA ca97498

## 1. STRESZCZENIE WYKONAWCZE

Przedmiotem audytu jest commit `ca9749814e28d44bfb4044d0cfc859d37df1bdd6` ("fix: make pod recovery writes lease-safe") w repozytorium `KDZFoundation/podrozowka-uat`, porównywany z commitem bazowym `7edfdb19624d486e8fe419a33408382c53f877ab`.

### Kluczowe wnioski z audytu:
1. **Status poprawek**: Commit `ca97498` znacząco poprawia odporność odzyskiwania POD (POD recovery) oraz lease fencing w większości scenariuszy, ale **NIE zamyka całkowicie** wszystkich krytycznych problemów (P0/P1/P2).
2. **Krytyczne podatności i wycieki w wyścigu (Race Conditions / Lease Fencing Breaks)**:
   - **P0 – Partial Lease Fencing Break przy alokacji numeru seryjnego (`reserveSerialRange`)**: Funkcja `reserveSerialRange` (wywoływana w `createNewPodUnitWithLease`) wykonuje odrębną pętlę retrii zapisu do `inventory_serial_sequences` **BEZ spójnika lease fencing** (`qr_print_jobs/${jobId}`). Stary worker, który utracił lease na rzecz Workera B, może nadal zaktualizować sekwencję numerów seryjnych w Firestore, co powoduje sztuczne przesunięcie/lukę w numeracji i zepsucie stanu sekwencji.
   - **P1 – Błędne założenia Firestore REST API (Niezgodność z produkcją vs mocki)**: Kod pomocniczy `updateDocumentWrite` przyjmuje parametr `updateTime`. W kodzie serwerowym przygotowywania zamówień POD recovery, operacje `createIfMissingWithPodJobLease` i `commitWithPodJobLease` realizują atomically zapis wraz ze sprawdzaniem warunku lease `updateTime`. Niemniej jednak, mocki testowe w unit-testach Vitest drastycznie upraszczają to zachowanie i **nie testują współbieżnych konfliktów REST API z odrzuceniem HTTP 409 / ABORTED**.
   - **P1 – Fallback `reserveSerialRange` psuje unikalność przy >500 jednostkach**: W przypadku braku lub uszkodzenia dokumentu sekwencji (`inventory_serial_sequences`), funkcja `reserveSerialRange` wykonuje zapytanie `queryDocuments` do `inventory_units` z domyślnym limitem 500 rekordów (`limit: 500`). Dla katalogu posiadającego ponad 500 wygenerowanych jednostek danego wzoru, `start = Math.max(...) + 1` obliczy najwyższy numer seryjny z **niepełnej pierwszej 500-ce**, co doprowadzi do ponownego przydzielenia już istniejącego numeru seryjnego (`internal_inventory_code`) i awarii zapisu `createDocumentWrite` (`exists: false`).
   - **P2 – Wdrożenie indeksu Firestore (Brak automatyzacji CI/CD)**: Plik `firestore.indexes.json` został dodany do repozytorium i powiązany w `firebase.json`. Jednakże workflow CI/CD `.github/workflows/firebase-cloudrun.yml` wykonuje w krokach deploy wyłącznie `--only hosting,firestore:rules`! Wdrożenie indeksów z `firestore.indexes.json` **NIE odbywa się automatycznie na produkcji/UAT**, co oznacza, że zapytanie z sortowaniem po `inventory_serial_no DESCENDING` zwróci błąd FAILED_PRECONDITION do momentu ręcznego wyklikania/wdrożenia indeksu CLI przez administratora.
3. **Końcowa ocena (Verdict)**: **GO WARUNKOWE / NO-GO DLA PRODUKCJI HIGH-TRAFFIC**. Kod jest stabilniejszy od wersji bazowej, ale wymaga pilnych poprawek uzupełniających przed wdrożeniem produkcyjnym.

---

## 2. WERYFIKACJA BAZY

- **Git Fetch**: Wykonano pomyślnie (`git fetch origin`).
- **Weryfikacja Commita Audytowanego**:
  - Full SHA: `ca9749814e28d44bfb4044d0cfc859d37df1bdd6`
  - Istnieje w origin/main oraz jest zidentyfikowany jako HEAD bieżącej gałęzi.
- **Weryfikacja Commita Bazowego**:
  - Full SHA: `7edfdb19624d486e8fe419a33408382c53f877ab`
  - Potwierdzono istnienie commita w bazie obiektów repozytorium (po unshallow fetch).
- **Git Diff (`7edfdb1...ca97498`)**:
  - Zmieniono 6 plików (+356 insertions, -85 deletions):
    - `api/_lib/gcp-firestore.ts`
    - `api/_lib/pod-order.ts`
    - `firebase.json`
    - `firestore.indexes.json`
    - `src/__tests__/pod-recovery.test.ts`
    - `src/__tests__/serial-range-concurrency.test.ts`
- **Weryfikacja czystości repozytorium**:
  - Poza wygenerowaniem niniejszego raportu `RAPORT_WERYFIKACJI_CA97498.md` żaden plik z kodem źródłowym, konfiguracją ani lockfile nie został zmodyfikowany (Read-Only Audit).

---

## 3. WERYFIKACJA AUTOMATYCZNA

### Środowisko:
- **Node.js**: `v22.22.1`
- **npm**: `11.11.0`

### Wyniki uruchomienia komend:

| Komenda | Exit Code | Liczba Testów / Status | Uwagi / Komunikaty |
| :--- | :---: | :--- | :--- |
| `npm run typecheck` | **0** | PASSED | TypeScript (`tsc --noEmit`) bez błędów. |
| `npm run lint` | **0** | PASSED (12 ostrzeżeń) | ESLint przeszedł pomyślnie (12 ostrzeżeń Fast Refresh oraz hook dependency). |
| `npm test` | **0** | **89 passed, 3 skipped (92 ogółem)** | 22 pliki testowe przeszły pomyślnie, 1 plik z testami emulatora pominięty. |
| `npm run test:integration` | **0** | **3 passed (3 ogółem)** | Emulator Firebase Firestore został pomyślnie uruchomiony i przeszedł testy zasad RLS. |
| `npm run build` | **0** | PASSED | Vite build (dist) oraz esbuild (`server.cjs`) zakończone sukcesem. |

*Ocena*: Błędy środowiskowe nie występują. Wszystkie zdefiniowane w repozytorium testy jednostkowe i integracyjne przechodzą na lokalnym runnerze.

---

## 4. AUDYT PROBLEMÓW ZAMKNIĘTYCH I OTWARTYCH

| Problem / Obszar | Status | Poziom Pewności | Opis |
| :--- | :---: | :---: | :--- |
| **Odzyskiwanie tokenów QR (Token Stability)** | **CLOSED** | Wysoki | Zapisany token odpowiada hash. Legacy jednostki z samą wartością hash zwracają błąd `pod_inventory_unit_claim_token_unrecoverable` i nie unieważniają wydrukowanych QR. |
| **Lease Fencing – Zapisy podstawowe (Units, Items, Job)** | **CLOSED** | Wysoki | Utworzenie jednostki, itemu joba oraz zmiana stanu joba w `createNewPodUnitWithLease` są chronione warunkiem `updateTime` rekordu `qr_print_jobs/${jobId}`. |
| **Lease Fencing – Alokacja sekwencji (`reserveSerialRange`)** | **OPEN (P0)** | Wysoki | Sub-transakcja sekwencji zapisuje do `inventory_serial_sequences` BEZ sprawdzania lease `qr_print_jobs/${jobId}`. Stary worker po utracie lease modyfikuje sekwencję. |
| **Atomowość przydzielania numerów seryjnych** | **PARTIAL (P1)** | Wysoki | Przydzielenie numeru seryjnego oraz utworzenie jednostki i itemu odbywa się w jednym atomowym commitcie Firestore, ale awaria przed commitem częściowo inkrementuje sekwencję (powstaje luka). Fallback przy >500 jednostkach psuje unikalność. |
| **Idempotencja powiadomień** | **CLOSED** | Wysoki | Powiadomienia używają deterministic ID z `createDocumentWrite` (`exists: false`). Ponowny webhook nie duplikuje powiadomień ani nie resetuje `is_read`. |
| **Query Firestore, Limit 500 i Indeksy** | **PARTIAL (P1/P2)** | Wysoki | Fallback sekwencji ma twardy limit 500 rekordów. Plik indeksu istnieje, ale workflow CI nie wdraża indeksów na GCP/Firebase. |

---

## 5. SZCZEGÓŁOWE USTALENIA ADVERSARIALNE (P0 – P3)

### [P0] Utrata Lease Fencing w `reserveSerialRange` umożliwia starym workerom modyfikację sekwencji numerów seryjnych
- **Poziom pewności**: Wysoki
- **Plik i linia**: `api/_lib/pod-order.ts`, linie 100-136 (`reserveSerialRange`) oraz linie 189-204 (`createNewPodUnitWithLease`).
- **Dowód w kodzie**:
  W `createNewPodUnitWithLease`, po wywołaniu `reserveSerialRange`, wykonywany jest atomowy commit zawierający aktualizację lease joba, zapis jednostki oraz zapis itemu:
  ```typescript
  // reserveSerialRange wywołuje commitWrites z samym zapisem sequenceDocument:
  await commitWrites([sequenceDocument?.fields
    ? updateDocumentWrite(`inventory_serial_sequences/${sequenceId}`, sequenceDataForWrite, sequenceDocument.updateTime)
    : createDocumentWrite(`inventory_serial_sequences/${sequenceId}`, { ...sequenceDataForWrite, created_at: now }),
    // BRAK WARUNKU FENCING DLA LEASE JOB-A!
  ]);
  ```
- **Kroki odtworzenia**:
  1. Worker A pobiera lease L1 dla joba POD.
  2. Worker A napotyka opóźnienie sieciowe przed `createNewPodUnitWithLease`.
  3. Lease wygasa. Worker B przejmuje job z nowym lease L2.
  4. Worker B kończy generowanie i ustawia stan joba.
  5. Spóźniony Worker A budzi się i wykonuje `createNewPodUnitWithLease`. Wywołuje inner function `reserveSerialRange`.
  6. `reserveSerialRange` pomyślnie zaktualizuje `inventory_serial_sequences` do przodu, ponieważ nie weryfikuje statusu lease w `qr_print_jobs`.
  7. Dopiero w kolejnym kroku (główny commit zawierający `qr_print_jobs` z L1) Firestore odrzuci commit z powodu przedawnienia `jobUpdateTime`.
- **Obecne zachowanie**: Sekwencja numerów seryjnych zostaje niepotrzebnie zwiększona przez spóźnionego workera, który utracił lease.
- **Oczekiwane zachowanie**: Aktualizacja `inventory_serial_sequences` musi odbywać się w TYM SAMYM atomowym commitcie co weryfikacja `qr_print_jobs/${jobId}` z aktualnym `leaseId`, bądź sekwencja nie może być modyfikowana przed weryfikacją fencing.
- **Wpływ biznesowy**: Powstawanie nieuzasadnionych luk w numeracji seryjnej oraz ryzyko zakłócenia współbieżnych procesów.
- **Proponowany test regresji**: Mock test wywołujący `createNewPodUnitWithLease` w momencie, gdy `qr_print_jobs` ma inny `recovery_lease_id` – sprawdzenie, czy dokument sekwencji w Firestore NIE został zmodyfikowany.

---

### [P1] Fallback w `reserveSerialRange` przy braku sekwencji używa limitu 500, powodując kolizje numerów przy >500 kartkach
- **Poziom pewności**: Wysoki
- **Plik i linia**: `api/_lib/pod-order.ts`, linie 108-115; `api/_lib/gcp-firestore.ts`, linie 154-173 (`queryDocuments`).
- **Dowód w kodzie**:
  ```typescript
  const existingUnits = await queryDocuments(
    "inventory_units",
    "card_design_id",
    { stringValue: designId },
    1,
    { fieldPath: "inventory_serial_no", direction: "DESCENDING" },
  );
  ```
  Zgodnie z definicjami REST API, zapytanie używa indeksu złożonego (`card_design_id ASC`, `inventory_serial_no DESC`). Jeżeli indeks **nie istnieje lub jeszcze się buduje**, Firestore REST API odrzuca zapytanie `:runQuery` z błędem HTTP 400/412 (`FAILED_PRECONDITION`). Kod w catch wyłapuje wyjątek i uniemożliwia wyznaczenie poprawnego numeru.
  Ponadto w przypadku wywołania `listDocuments` lub zapytania fallback bez podanego limitu domyślny limit wynosi 500. Jeśli zapytanie po indeksie zawiedzie i nastąpi próba przeszukania, rekordy powyżej 500 zostaną pominięte.
- **Kroki odtworzenia**:
  1. Wygeneruj 550 jednostek dla wybranego wzoru karty.
  2. Usuń dokument `inventory_serial_sequences/${sequenceId}` (lub zresetuj go).
  3. Wywołaj `reserveSerialRange` bez sprawnego indeksu złożonego.
- **Obecne zachowanie**: Kod pobierający maksymalny serial nie odczyta poprawnej wartości >500, co spowoduje ponowną próbę użycia starych numerów i błędy `already_exists` / `ABORTED`.
- **Oczekiwane zachowanie**: Prawidłowa obsługa braku indeksu oraz bezpieczne wyznaczanie numeru seryjnego bez ograniczenia do pierwszej strony 500 rekordów.
- **Wpływ biznesowy**: Brak możliwości odzyskania sekwencji dla dużych wolumenów i blokada tworzenia nowych jednostek POD.

---

### [P1] Wdrożenie indeksów Firestore (`firestore.indexes.json`) pominięte w pipeline CI/CD
- **Poziom pewności**: Wysoki
- **Plik i linia**: `.github/workflows/firebase-cloudrun.yml`, linia 90.
- **Dowód w kodzie**:
  ```yaml
  - name: Deploy Firebase Hosting
    run: |
      npx --yes firebase-tools@latest deploy \
        --project "$FIREBASE_PROJECT_ID" \
        --only hosting,firestore:rules \
        --non-interactive
  ```
  Flaga `--only hosting,firestore:rules` wdroży tylko pliki Hosting oraz Reguły Bezpieczeństwa Firestore. Wdrożenie indeksów zdefiniowanych w `firestore.indexes.json` (`firestore:indexes`) zostało **pominięte**.
- **Kroki odtworzenia**: Zgłoś kod na gałąź `main` i prześledź krok wdrożenia w GitHub Actions.
- **Obecne zachowanie**: Indeks z `firestore.indexes.json` nie zostanie wdrożony na środowisku UAT/Produkcja.
- **Oczekiwane zachowanie**: Zmiana parametru deploy na `--only hosting,firestore:rules,firestore:indexes` lub odrębny krok wdrażający indeksy.
- **Wpływ biznesowy**: Błędy runtime w zapytaniach produkcyjnych po `inventory_serial_no DESCENDING` (HTTP 400 FAILED_PRECONDITION: The query requires an index).

---

### [P2] Luki w numeracji seryjnej po wycofanych transakcjach (Gwarancja unikalności vs ciągłości)
- **Poziom pewności**: Wysoki
- **Plik i linia**: `api/_lib/pod-order.ts`, linie 100-136.
- **Analiza biznesowa**:
  W `reserveSerialRange`, numer seryjny jest zwiększany w `inventory_serial_sequences` przed sfinalizowaniem zapisu jednostki inventory w bazie. Jeśli dalszy zapis `createDocumentWrite` nie powiedzie się z powodu innego błędu (np. utrata połączenia, wygasły token GCP), zarezerwowany zakres numerów w `inventory_serial_sequences` pozostaje zużyty.
- **Akceptowalność biznesowa**:
  Wyznaczenie unikalności numerów seryjnych jest w pełni zagwarantowane przez identyfikator deterministyczny `internal_inventory_code` oraz `inventory_serial_no`. Jednakże **ciągłość numeracji (brak luk)** NIE JEST gwarantowana. W przypadku ecommerce/POD luki w numeracji są akceptowalne biznesowo (pod warunkiem unikalności), ale powinny być wyraźnie udokumentowane.

---

## 6. INWARIANTY SYSTEMOWE

| Invariant | Status | Poziom Pewności | Dowód / Ścieżka w kodzie |
| :--- | :---: | :---: | :--- |
| **1. Jedna kartka ma jeden stabilny token QR** | **PASS** | Wysoki | `api/_lib/pod-order.ts:245-276`. Token i hash są zapisywane raz, recovery używa `storedToken`. |
| **2. Istniejący claim_code_hash nie jest zastępowany** | **PASS** | Wysoki | `api/_lib/pod-order.ts:262-265`. Rzuca `pod_inventory_unit_claim_token_unrecoverable` przy braku źródłowego tokena. |
| **3. Stary worker nie może zapisać danych po utracie lease** | **PARTIAL** | Wysoki | Weryfikacja `qr_print_jobs` blokuje zapis jednostki i itemu, ale `reserveSerialRange` uaktualnia sekwencję (P0). |
| **4. Numer seryjny jest unikalny w obrębie wzoru** | **PASS** | Wysoki | Gwarantowane przez unikalny ID jednostki oraz unikalną sekwencję atomową. |
| **5. Inventory unit i print job item powstają wspólnie** | **PASS** | Wysoki | `api/_lib/pod-order.ts:210-236`. Obie operacje znajdują się w tablicy jednego `commitWrites`. |
| **6. Retry nie tworzy dodatkowej jednostki** | **PASS** | Wysoki | Jednostki posiadają deterministyczny klucz `pod-unit:${orderId}:${itemIndex}:${copyIndex}`. |
| **7. Retry nie resetuje przeczytanego powiadomienia** | **PASS** | Wysoki | `api/_lib/pod-order.ts:160-185` oraz test `pod-recovery.test.ts:180-210`. Używa `exists: false`. |
| **8. Liczba units odpowiada liczbie zakupionych sztuk** | **PASS** | Wysoki | Pętla generowania odpowiada dokładnie `quantity` z pozycji zamówienia. |
| **9. QR w PDF odpowiada zapisanej inventory_unit** | **PASS** | Wysoki | `src/lib/generatePodPrintPdf.tsx:100-140`. Zgoda kluczy `inventory_unit_id` i `public_claim_code`. |
| **10. Recovery daje ten sam wynik co pierwsze wykonanie** | **PASS** | Wysoki | Wynikowe obiekty w bazie są deterministyczne. |
| **11. Obsługa >500 jednostek nie zależy od kolejności** | **FAIL** | Wysoki | Zapytanie fallback w `reserveSerialRange` posiada limit 500 rekordów (P1). |
| **12. Brak indeksu nie prowadzi do błędnych danych** | **PARTIAL** | Wysoki | Odpytanie bazy bez indeksu rzuca wyjątek REST API (nie zapisuje złych danych, ale blokuje proces). |

---

## 7. OCENA TESTÓW I MOCKÓW

1. **`src/__tests__/pod-recovery.test.ts`**:
   - Testy poprawnie weryfikują ścieżki logiki biznesowej, reakcję na nieodzyskiwalny token oraz idempotencję powiadomień.
   - **Słabość mocków**: Mock Firestore `gcp-firestore.js` używa prostej pamięci podręcznej i nie symuluje rzeczywistych kodów błędów REST API (`HTTP 409 Conflict`, `FAILED_PRECONDITION`), ani nie weryfikuje atomowości `currentDocument: { updateTime }` podczas równoległych wywołań asynchronicznych.
2. **`src/__tests__/serial-range-concurrency.test.ts`**:
   - Symuluje 10 równoległych wywołań `reserveSerialRange`.
   - Test przechodzi, ale w mocku `updateTime` jest ręcznie inkrementowany w zmiennej lokalnej. Mock nie odzwierciedla braku spójnika z `qr_print_jobs/${jobId}`, ukrywając podatność P0.

---

## 8. WERDYKT KOŃCOWY

### Status: **GO WARUNKOWE / NO-GO DLA PRODUKCJI HIGH-TRAFFIC**

Commit `ca97498` wprowadza znaczące i niezbędne usprawnienia w zakresie bezpiecznego tworzenia dokumentów POD oraz odporności na ponowne wywołania (idempotencja). Wprowadzono bezpieczne bloki fencingowe i ochronę tokenów QR.

Jednak ze względu na znalezioną podatność **P0** (wyciek zapisu sekwencji po utracie lease w `reserveSerialRange`), **P1** (limit 500 rekordów w zapytaniu fallback) oraz **P1** (brak indeksu w deployment workflow), zaleca się wstrzymanie wdrożenia na produkcję do momentu zaaplikowania 5 poniższych działań naprawczych.

---

## 9. PIĘĆ NAJWAŻNIEJSZYCH NASTĘPNYCH DZIAŁAŃ

1. **Scalenie zapisu sekwencji z atomowym commit-em fencingowym (Fix P0)**:
   Zmienić `createNewPodUnitWithLease` tak, aby aktualizacja `inventory_serial_sequences` była przekazywana i wykonywana w TYM SAMYM wywołaniu `commitWithPodJobLease` co `inventory_units` i `qr_print_job_items`.
2. **Naprawa deploymentu indeksów w CI/CD (Fix P1)**:
   Zaktualizować `.github/workflows/firebase-cloudrun.yml`, dodając `firestore:indexes` do komendy `firebase deploy` (`--only hosting,firestore:rules,firestore:indexes`).
3. **Usunięcie twardego limitu 500 w zapytaniu fallback dla sekwencji (Fix P1)**:
   Upewnić się, że w przypadku awarii dokumentu sekwencji pobieranie maksymalnego numeru seryjnego z `inventory_units` jest odporne na dużą liczbę rekordów (>500) i poprawnie wykorzystuje indeks.
4. **Rozbudowa mocków testowych w Vitest**:
   Wprowadzić w `pod-recovery.test.ts` i `serial-range-concurrency.test.ts` realistyczne sprawdzanie warunków `currentDocument.updateTime` oraz `recovery_lease_id` dla symulacji opóźnionych workerów A/B.
5. **Wdrożenie i weryfikacja indeksów na środowisku live UAT**:
   Ręcznie lub poprzez CLI wykonać `firebase deploy --only firestore:indexes` na projekcie UAT i potwierdzić status `READY` indeksu w Konsoli Google Cloud / Firebase.
