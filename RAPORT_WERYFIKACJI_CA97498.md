# RAPORT WERYFIKACJI ADVERSARIALNEJ COMMITA ca97498

## KOREKTA PO PONOWNEJ ANALIZIE CALL GRAPHU I SEMANTYKI KODU

Po przeprowadzeniu dodatkowej, szczegółowej analizy call graphu oraz semantyki wykonania funkcji w `api/_lib/pod-order.ts`, dokonano istotnych korekt w stosunku do wstępnej analizy:

1. **Brak wywołania `reserveSerialRange` w produkcyjnym runtime**:
   - Funkcja `reserveSerialRange` **NIE jest wywoływana** ani w `preparePaidOrderPod`, ani w `createNewPodUnitWithLease`.
   - Jedynym miejscem wywołania `reserveSerialRange` w całym repozytorium jest test `src/__tests__/serial-range-concurrency.test.ts`.
   - W związku z tym, usunięto klasyfikację **P0** (fencing break przy alokacji numeru). Pomocnicza funkcja `reserveSerialRange` stanowi obecnie jedynie nieużywany w runtime helper (dług techniczny / ryzyko P3).

2. **Pełna atomowość produkcyjnej ścieżki `createNewPodUnitWithLease`**:
   - Produkcyjna funkcja `createNewPodUnitWithLease` wykonuje **jeden pojedynczy, atomowy `commitWrites`**, w którym równocześnie znajdują się 4 operacje:
     1. Aktualizacja statusu lease joba (`qr_print_jobs/${input.jobId}`) z precondition `currentDocument.updateTime`.
     2. Aktualizacja/utworzenie sekwencji (`inventory_serial_sequences/${sequenceId}`).
     3. Utworzenie jednostki (`inventory_units/${input.unitId}`).
     4. Utworzenie pozycji w jobie (`qr_print_job_items/${input.itemId}`).
   - W Firestore REST API niepowodzenie sprawdzania precondition dla `qr_print_jobs` (utrata lease przez Workera A) odrzuca **cały atomowy commit**. Stary worker nie może przesunąć sekwencji bez utworzenia jednostki.

3. **Poprawna analiza zapytania o najwyższy serial (Limit 500)**:
   - W `createNewPodUnitWithLease` zapytanie do `inventory_units` przekazuje parametr `queryLimit = 1` oraz `orderBy: [{ fieldPath: "inventory_serial_no", direction: "DESCENDING" }]`.
   - Zapytanie pobiera dokładnie 1 rekord o najwyższym numerze seryjnym. Domyślny limit 500 w `queryDocuments` nie ma zastosowania. Usuwa się ustalenie P1 o "pobieraniu pierwszej 500-tki".

4. **Doprecyzowanie procesu CI/CD dla indeksów Firestore**:
   - Potwierdzono, że workflow `.github/workflows/firebase-cloudrun.yml` wywołuje `firebase deploy --only hosting,firestore:rules`.
   - Wdrożenie `firestore:indexes` nie jest zautomatyzowane w pipeline CI/CD (P1 dla procesu CI/CD).
   - Oznaczono stan indeksu na żywym środowisku UAT jako **NOT TESTED** (brak możliwości bezpośredniej weryfikacji bez autoryzowanych danych dostępowych GCP CLI).

---

## 1. STRESZCZENIE WYKONAWCZE

Przedmiotem audytu jest commit `ca9749814e28d44bfb4044d0cfc859d37df1bdd6` ("fix: make pod recovery writes lease-safe") w repozytorium `KDZFoundation/podrozowka-uat`, porównywany z commitem bazowym `7edfdb19624d486e8fe419a33408382c53f877ab`.

### Kluczowe wnioski z audytu:
1. **Status poprawek**: Commit `ca97498` skutecznie rozwiązuje kluczowe problemy P0/P1 w produkcyjnej ścieżce generowania i odzyskiwania jednostek POD.
2. **Atomowość i Lease Fencing w Produkcji**:
   - Produkcyjne operacje zapisu w `createNewPodUnitWithLease` (lease joba, sekwencja numerów seryjnych, jednostka inventory_units oraz pozycja qr_print_job_items) są połączone w **jeden atomowy `commitWrites`**.
   - Spóźniony Worker A po utracie lease na rzecz Workera B zostanie bezwzględnie zablokowany przez Firestore REST API (konflikt `updateTime` na `qr_print_jobs`), co zapobiega wyciekom danych, duplikatom i sierocym zmianom w sekwencji.
3. **Idempotencja i Stabilność QR Tokenów**:
   - Odzyskiwanie tokenów QR preserves istniejący token i hash. Legacy jednostka nie unieważnia wcześniej wydrukowanych kart.
   - Powiadomienia używają deterministic ID z klauzulą `exists: false`, zapobiegając nadpisaniu i zmianie stanu `is_read`.
4. **Zidentyfikowane Ryzyka Procesowe i Testowe (OPEN P1/P2/P3)**:
   - **P1 (Proces CI/CD)**: Pipeline deploymentu w `.github/workflows/firebase-cloudrun.yml` pomija flagę `firestore:indexes`. Wdrożenie na nowe środowisko może zablokować generowanie POD z błędem `FAILED_PRECONDITION` do czasu ręcznego utworzenia indeksu.
   - **P2 (Jakość Testów)**: Mocki Vitest w `src/__tests__/pod-recovery.test.ts` są uproszczone i nie symulują pełnych odrzuceń atomowych transakcji Firestore REST API.
   - **P3 (Dług Techniczny)**: Nieużywana funkcja `reserveSerialRange` wykonuje zapis sekwencji bez Lease Fencing i powinna zostać usunięta lub zrefaktoryzowana.
5. **Końcowa ocena (Verdict)**: **GO WARUNKOWE DLA UAT**. Kod produkcyjny jest poprawny pod względem atomowości i fencing. Przed wdrożeniem na produkcję wymagane jest ręczne upewnienie się o obecności indeksu oraz uzupełnienie pipeline CI/CD.

---

## 2. WERYFIKACJA BAZY

- **Git Fetch**: Wykonano pomyślnie (`git fetch origin`).
- **Weryfikacja Commita Audytowanego**:
  - Full SHA: `ca9749814e28d44bfb4044d0cfc859d37df1bdd6`
  - Istnieje w origin/main oraz jest zidentyfikowany jako HEAD bieżącej gałęzi.
- **Weryfikacja Commita Bazowego**:
  - Full SHA: `7edfdb19624d486e8fe419a33408382c53f877ab`
  - Potwierdzono istnienie commita w bazie obiektów repozytorium.
- **Git Diff (`7edfdb1...ca97498`)**:
  - Zmieniono 6 plików (+356 insertions, -85 deletions):
    - `api/_lib/gcp-firestore.ts`
    - `api/_lib/pod-order.ts`
    - `firebase.json`
    - `firestore.indexes.json`
    - `src/__tests__/pod-recovery.test.ts`
    - `src/__tests__/serial-range-concurrency.test.ts`
- **Weryfikacja czystości repozytorium**:
  - Poza aktualizacją raportu `RAPORT_WERYFIKACJI_CA97498.md` żaden plik z kodem źródłowym, konfiguracją ani lockfile nie został zmodyfikowany (Read-Only Audit).

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
| `npm run test:integration` | **0** | **3 passed (3 ogółem)** | Emulator Firebase Firestore uruchomiony pomyślnie, testy zasad RLS zaliczone. |
| `npm run build` | **0** | PASSED | Vite build (dist) oraz esbuild (`server.cjs`) zakończone sukcesem. |

---

## 4. AUDYT PROBLEMÓW ZAMKNIĘTYCH I OTWARTYCH

| Problem / Obszar | Status | Poziom Pewności | Opis |
| :--- | :---: | :---: | :--- |
| **Odzyskiwanie tokenów QR (Token Stability)** | **CLOSED** | Wysoki | Zapisany token odpowiada hash. Legacy jednostki z samą wartością hash zwracają błąd `pod_inventory_unit_claim_token_unrecoverable` i nie unieważniają wydrukowanych QR. |
| **Lease Fencing – Zapisy produkcyjne POD** | **CLOSED** | Wysoki | W `createNewPodUnitWithLease` zapisy `qr_print_jobs`, `inventory_serial_sequences`, `inventory_units` i `qr_print_job_items` są w jednym atomowym commitcie chronionym lease. |
| **Atomowość przydzielania numerów seryjnych** | **CLOSED** | Wysoki | Numeracja i tworzenie jednostki zachodzą atomowo. Awaria przed commitem nie zużywa numeru ani nie modyfikuje bazy. |
| **Idempotencja powiadomień** | **CLOSED** | Wysoki | Powiadomienia używają deterministic ID z `createDocumentWrite` (`exists: false`). Ponowny webhook nie duplikuje powiadomień ani nie resetuje `is_read`. |
| **Automatyzacja wdrożenia indeksów w CI/CD** | **OPEN (P1)** | Wysoki | Workflow `.github/workflows/firebase-cloudrun.yml` wywołuje `firebase deploy --only hosting,firestore:rules`, pomijając `firestore:indexes`. |
| **Brak emulatorowych testów wyścigu updateTime** | **OPEN (P2)** | Wysoki | Testy Vitest używają zaktualizowanych mocków, ale brak dedykowanego testu na fizycznym emulatorze Firestore sprawdzającego odrzucenie wyścigu w `commitWrites`. |
| **Nieużywany helper `reserveSerialRange`** | **OPEN (P3)** | Wysoki | Funkcja `reserveSerialRange` nie jest wywoływana w runtime, ale zawiera osobną pętlę bez lease fencing. Stanowi dług techniczny. |

---

## 5. SZCZEGÓŁOWE USTALENIA ADVERSARIALNE (P1 – P3)

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
  Flaga `--only hosting,firestore:rules` wdroży tylko pliki Hosting oraz Reguły Bezpieczeństwa Firestore. Wdrożenie indeksów zdefiniowanych w `firestore.indexes.json` (`firestore:indexes`) zostało **pominięte w automatycznym pipeline**.
- **Kroki odtworzenia**: Zgłoś nowy kod do gałęzi `main` i prześledź kroki deploymentu w GitHub Actions.
- **Obecne zachowanie**: Indeks z `firestore.indexes.json` nie jest automatycznie wgrywany przez CI/CD.
- **Oczekiwane zachowanie**: Rozszerzenie polecenia deploy do `--only hosting,firestore:rules,firestore:indexes`.
- **Wpływ biznesowy**: Ryzyko wystąpienia błędu `FAILED_PRECONDITION` na nowo postawionych środowiskach w przypadku braku ręcznego wdrożenia indeksu.
- **Status na środowisku żywym**: **NOT TESTED** (wymaga autoryzowanego dostępu do konsoli GCP/Firebase).

---

### [P2] Brak realistycznych testów emulatorowych dla współbieżnego konfliktu `updateTime`
- **Poziom pewności**: Wysoki
- **Plik i linia**: `src/__tests__/pod-recovery.test.ts` oraz `src/__tests__/firestore-rules.integration.test.ts`.
- **Dowód w kodzie**:
  Mocki w `pod-recovery.test.ts` poprawnie symulują powrót funkcji i sukcesy zapisu, ale nie testują zachowania Firestore przy odrzuceniu atomowego `commitWrites` przez wyścig dwóch procesów Node.js wywołujących REST API.
- **Proponowany test emulatorowy**:
  1. Utwórz job POD z lease A w emulatorze Firestore.
  2. Pobierz `updateTime` jako Worker A.
  3. Przejmij job jako Worker B (zmieniając lease i uaktualniając dokument w emulatorze).
  4. Spróbuj wykonać atomowy `commitWrites` Workera A zawierający wygasły `updateTime` dla joba.
  5. Potwierdź, że emulator odrzuca cały commit i żaden dokument (`inventory_units`, `qr_print_job_items`, `inventory_serial_sequences`) nie zostaje utworzony.

---

### [P3] Nieużywana w runtime funkcja `reserveSerialRange` stanowi dług techniczny
- **Poziom pewności**: Wysoki
- **Plik i linia**: `api/_lib/pod-order.ts`, linie 97-136.
- **Dowód w kodzie**:
  Funkcja `reserveSerialRange` została zastąpiona w produkcyjnym przepływie przez `createNewPodUnitWithLease`. W kodzie runtime brak jest jakichkolwiek wywołań tej funkcji.
- **Wpływ biznesowy**: Brak bezpośredniego wpływu na produkcję. Istnieje jedynie niewielkie ryzyko pomylenia helperów przez deweloperów w przyszłości.
- **Rekomendacja**: Usunięcie funkcji lub refaktoryzacja, by wykorzystywała ten sam wzorzec fencingowy co `createNewPodUnitWithLease`.

---

## 6. INWARIANTY SYSTEMOWE

| Invariant | Status | Poziom Pewności | Dowód / Ścieżka w kodzie |
| :--- | :---: | :---: | :--- |
| **1. Jedna kartka ma jeden stabilny token QR** | **PASS** | Wysoki | `api/_lib/pod-order.ts:245-276`. Token i hash są zapisywane raz, recovery używa `storedToken`. |
| **2. Istniejący claim_code_hash nie jest zastępowany** | **PASS** | Wysoki | `api/_lib/pod-order.ts:262-265`. Rzuca `pod_inventory_unit_claim_token_unrecoverable` przy braku źródłowego tokena. |
| **3. Stary worker nie może zapisać danych po utracie lease** | **PASS** | Wysoki | Atomowy `commitWrites` sprawdza `updateTime` na `qr_print_jobs/${jobId}`, blokując całą transakcję. |
| **4. Numer seryjny jest unikalny w obrębie wzoru** | **PASS** | Wysoki | Sekwencja i jednostka powstają w jednym atomowym commitcie z klauzulą `exists: false`. |
| **5. Inventory unit i print job item powstają wspólnie** | **PASS** | Wysoki | `api/_lib/pod-order.ts:210-236`. Obie operacje znajdują się w tablicy jednego `commitWrites`. |
| **6. Retry nie tworzy dodatkowej jednostki** | **PASS** | Wysoki | Jednostki posiadają deterministyczny klucz `pod-unit:${orderId}:${itemIndex}:${copyIndex}`. |
| **7. Retry nie resetuje przeczytanego powiadomienia** | **PASS** | Wysoki | `api/_lib/pod-order.ts:160-185` oraz test `pod-recovery.test.ts:180-210`. Używa `exists: false`. |
| **8. Liczba units odpowiada liczbie zakupionych sztuk** | **PASS** | Wysoki | Pętla generowania odpowiada dokładnie `quantity` z pozycji zamówienia. |
| **9. QR w PDF odpowiada zapisanej inventory_unit** | **PASS** | Wysoki | `src/lib/generatePodPrintPdf.tsx:100-140`. Zgoda kluczy `inventory_unit_id` i `public_claim_code`. |
| **10. Recovery daje ten sam wynik co pierwsze wykonanie** | **PASS** | Wysoki | Wynikowe obiekty w bazie są deterministyczne. |
| **11. Obsługa >500 jednostek nie zależy od kolejności** | **PASS** | Wysoki | Zapytanie w `createNewPodUnitWithLease` przekazuje `queryLimit = 1` z sortowaniem `DESCENDING`. |
| **12. Brak indeksu nie prowadzi do błędnych danych** | **PASS** | Wysoki | Odpytanie bazy bez indeksu rzuca błąd REST API (blokuje wykonanie, zapobiegając zapisom nieprawidłowych danych). |

---

## 7. OCENA TESTÓW I MOCKÓW

1. **`src/__tests__/pod-recovery.test.ts`**:
   - Testy jednostkowe w pełni weryfikują ścieżki biznesowe: odzyskiwanie uszkodzonych/niepłatnych zamówień, idempotencję powiadomień oraz obsługę nieodzyskiwalnych tokenów legacy.
   - Mocki w Vitest poprawnie symulują wywołania `commitWrites`.
2. **`src/__tests__/serial-range-concurrency.test.ts`**:
   - Testuje znieaktualizowany helper `reserveSerialRange`. Należy uzupełnienie zestaw testów o dedykowany test współbieżności dla produkcyjnej funkcji `createNewPodUnitWithLease`.

---

## 8. WERDYKT KOŃCOWY

### Status: **GO WARUNKOWE DLA UAT**

Commit `ca97498` spełnia wymagania bezpieczeństwa i atomowości w produkcyjnym kodzie runtime. Wprowadzenie połączonego atomowego `commitWrites` zabezpiecza proces przed wyścigami równoległych workerów oraz niepotrzebną alokacją seryjną.

---

## 9. PIĘĆ NAJWAŻNIEJSZYCH NASTĘPNYCH DZIAŁAŃ

1. **Dodanie flagi `firestore:indexes` do workflow CI/CD (Fix P1)**:
   Zaktualizować `.github/workflows/firebase-cloudrun.yml` do postaci `--only hosting,firestore:rules,firestore:indexes`.
2. **Weryfikacja/wdrożenie indeksu Firestore na środowisku live UAT**:
   Uruchomić `firebase deploy --only firestore:indexes --project podrozowka` i potwierdzić obecność indeksu w konsoli Firebase.
3. **Napisanie testu integracyjnego na emulatorze Firestore dla konfliktu `updateTime` (Fix P2)**:
   Dodać w testach emulatora przypadek odrzucenia spóźnionego `commitWrites` Workera A przy zmienionym lease.
4. **Usunięcie nieużywanego helpera `reserveSerialRange` (Clean Code / P3)**:
   Usunąć lub zrefaktoryzować martwy kod helpera, aby uniknąć pomyłek w przyszłości.
5. **Uzupełnienie zestawu testów jednostkowych dla `createNewPodUnitWithLease`**:
   Dodać bezpośredni test jednostkowy sprawdzający strukturę 4 zapisów w tablicy `commitWrites`.
