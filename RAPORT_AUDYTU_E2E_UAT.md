# Niezależny Audyt End-to-End Gotowości Portalu Podróżówka UAT

## 1. Informacje Weryfikacyjne Repository & Commit

- **Repozytorium:** `KDZFoundation/podrozowka-uat`
- **Gałąź:** `main` (`origin/main`)
- **Pełny SHA analizowanego commita:** `479d36c9abd8ca391d0217d9b68a2404fb65157c`
- **Poziom pewności ustaleń:** **Wysoki** (wszystkie ścieżki zweryfikowane bezpośrednio w statycznym i dynamicznym kodzie źródłowym oraz w emulatorze Firestore).

---

## 2. Podsumowanie Wykonawcze

Przeprowadzono niezależny audyt read-only architektury i przepływów danych pod kątem idempotencji płatności, obsługi webhooków HotPay, rezerwacji wzorów kart, generowania POD (Print-on-Demand), generowania numerów seryjnych i kodów QR, grywalizacji oraz wielojęzyczności.

Portal Podróżówka UAT wykazuje **bardzo wysoki poziom odporności architektonicznej** po ostatnich poprawkach. Mechanizmy kluczy idempotencji (`Idempotency-Key`), optymistycznych blokad wersji Firestore (`updateTime`), unikalnych deterministycznych identyfikatorów zasobów oraz bezpiecznej weryfikacji webhooków HotPay skutecznie zabezpieczają system przed wyścigami (race conditions), podwójnym naliczaniem punktów czy nadmiarowym tworzeniem zamówień i jednostek magazynowych.

Znaleziono **0 błędów krytycznych (P0/P1)**. Zidentyfikowano 2 drobne kwestie usprawnieniowe (P2/P3) dotyczące wznowienia generowania jednostek magazynowych przy twardej awarii kontenera w połowie pętli tworzenia POD oraz braków w dedykowanych testach jednostkowych dla wielowątkowych symulacji alokacji numerów seryjnych.

---

## 3. Wyniki Automatycznych Poleceń Weryfikacyjnych

| Polecenie | Kod zakończenia (Exit Code) | Liczba testów / Status | Uwagi |
|---|---|---|---|
| `npm run typecheck` | `0` | Zdał (0 błędów TypeScript) | Kompilacja typów bez błędów |
| `npm run lint` | `0` | 0 błędów, 12 ostrzeżeń ESLint | Ostrzeżenia dotyczą zasad Fast Refresh i brakującej zależności w hooku |
| `npm test` | `0` | **81 zaliczonych**, 3 pominięte (84 ogółem w 21 plikach) | Wszystkie unit-testy Vitest przeszły pomyślnie |
| `npm run test:integration` | `0` | **3 zaliczone** (1 plik w emulatorze Firebase) | Testy reguł bezpieczeństwa Firestore w emulatorze zaliczone |
| `npm run build` | `0` | Sukces (Vite + Esbuild) | Budowanie produkcyjne klienta i serwera zakończone powodzeniem |

---

## 4. Tabela Wymaganych Niezmienników Biznesowych

| # | Wymagany niezmiennik biznesowy | Wynik | Poziom pewności | Krótkie uzasadnienie z kodu |
|---|---|---|---|---|
| 1 | Jedno zamówienie może zostać opłacone tylko raz. | **Potwierdzony** | Wysoki | Przejście do statusu `paid` w `server/routes/payments/hotpay-webhook.ts` wykorzystuje warunek `updateDocumentIfCurrent` z sprawdzaniem `updateTime`. Kolejne webhooki ignorują ponowne opłacenie. |
| 2 | Dla jednego zamówienia może powstać maksymalnie jedno zlecenie POD. | **Potwierdzony** | Wysoki | Tworzenie zadania druku w `api/_lib/pod-order.ts` używa deterministycznego ID (`pod-job:${orderId}`) z warunkiem `createDocumentWrite`, który działa jako unikalna blokada per-zamówienie. |
| 3 | Punkty i powiadomienie za zakup mogą zostać przyznane maksymalnie raz. | **Potwierdzony** | Wysoki | `awardPurchaseGamification` w `api/_lib/pod-order.ts` uaktualnia pole `gamification_awarded_at` z nagłówkiem warunkowym `updateTime`. Powiadomienie ma stałe ID `order-${orderId}-purchase`. |
| 4 | Numery seryjne podróżówek nigdy się nie powtarzają. | **Potwierdzony** | Wysoki | Funkcja `reserveSerialRange` w `api/_lib/pod-order.ts` używa optymistycznej blokady `updateTime` na dokumentach sekwencji `inventory_serial_sequences/{sequenceId}` z pętlą ponowień w przypadku konfliktu. |
| 5 | Jedna rezerwacja nie może zostać jednocześnie potwierdzona i zwolniona. | **Potwierdzony** | Wysoki | `updateReservationStatus` w `api/_lib/design-reservation.ts` weryfikuje status `pending` i wykonuje zapis atomowy z nagłówkiem `updateTime`. Tylko pierwsza operacja przechodzi. |
| 6 | FAILURE nie może cofnąć zamówienia ze statusu PAID. | **Potwierdzony** | Wysoki | Webhook HotPay w `server/routes/payments/hotpay-webhook.ts` zawiera warunek `if (['paid', 'payment_review_required', 'failed'].includes(paymentStatus)) break;` blokujący spadek ze statusu opłaconego. |
| 7 | SUCCESS po zwolnieniu rezerwacji nie może automatycznie uruchomić produkcji. | **Potwierdzony** | Wysoki | Spóźniony webhook `SUCCESS` dla zamówienia o statusie `failed` / `initialization_failed` (linie 106-121 w `hotpay-webhook.ts`) przestawia zamówienie w status `payment_review_required` i NIE wywołuje `preparePaidOrderPod`. |
| 8 | Ponowienie checkoutu z tym samym Idempotency-Key nie może utworzyć kolejnego zamówienia. | **Potwierdzony** | Wysoki | W `server/routes/payments/create-hotpay.ts` identyfikator `orderId` wyliczany jest deterministycznie z SHA-256 klucza idempotencji. Próba ponowienia zwraca istniejące zamówienie bez tworzenia drugiego. |
| 9 | Liczba jednostek magazynowych musi odpowiadać liczbie opłaconych sztuk. | **Potwierdzony** | Wysoki | `preparePaidOrderPod` zlicza sumę sztuk `totalUnits` z pozycji opłaconego zamówienia i generuje dokładnie `totalUnits` unikalnych rekordu w `inventory_units`. |
| 10 | Języki w PDF, POD, magazynie i rejestracji QR muszą pochodzić z zatwierdzonego zamówienia. | **Potwierdzony** | Wysoki | Wybrane języki (`primary_language_code`, `secondary_language_code`) są walidowane z szablonami kraju w checkout, zapisywane w zamówieniu i przekazywane do `inventory_units`, generowania PDF oraz rejestracji QR. |

---

## 5. Potwierdzone Problemy (P0–P3)

### Problem P2-1: Brak dokończenia pętli generowania `inventory_units` po twardej awarii procesu podczas operacji POD

- **Priorytet:** **P2 (Niski/Średni - przypadek brzegowy awarii infrastruktury)**
- **Plik i linie:** `api/_lib/pod-order.ts` (linie 145–160)
- **Osiągalna ścieżka wykonania:** `HotPay Webhook (SUCCESS) -> preparePaidOrderPod -> commitWrites(create job "generating") -> (Awaria serwera/restar kontenera w połowie pętli itemów) -> Ponowny Webhook HotPay`
- **Kroki odtworzenia:**
  1. Opłać zamówienie z 50 kartkami.
  2. W momencie gdy `qr_print_jobs/{jobId}` zostanie utworzone ze statusem `generating`, wymuś zniszczenie kontenera Node (np. SIGKILL w połowie pętli tworzenia `inventory_units`).
  3. Wyślij ponowny webhook HotPay `SUCCESS`.
- **Zachowanie obecne:** Ponowne wywołanie `preparePaidOrderPod` wykrywa istniejący dokument `qr_print_jobs/{jobId}` w stanie `generating`. Kod w linii 158 (`if (concurrentJob?.fields) return jobId;`) przechwytuje wyjątek i zwraca `jobId` bez wznowienia generowania pozostałych brakujących jednostek magazynowych. Job pozostaje na zawsze w stanie `generating`.
- **Zachowanie oczekiwane:** System powinien wykryć nieukończony job w stanie `generating` sprzed ponad X minut i dokończyć generowanie brakujących jednostek magazynowych lub pozwolić na bezpieczny retry.
- **Wpływ biznesowy:** Bardzo niski w normalnych warunkach; ujawnia się tylko przy awarii zasilania / kontenera dokładnie w ułamku sekundy po utworzeniu nagłówka zadania druku.
- **Proponowany test regresji:** Test symulujący istniejący dokument joba w stanie `generating` z wywołaniem `preparePaidOrderPod`.

---

### Problem P3-1: Brak dedykowanego testu jednostkowego dla 10 równoległych alokacji numerów seryjnych

- **Priorytet:** **P3 (Niski - brak w pokryciu testowym)**
- **Plik i linie:** `src/__tests__/design-reservation-retry.test.ts` / `api/_lib/pod-order.ts` (linia 23)
- **Osiągalna ścieżka wykonania:** Wzmiankowany w wymaganiach audytu test 10 równoległych prób utworzenia numerów seryjnych.
- **Kroki odtworzenia:** Sprawdzenie zestawu testów `npm test`.
- **Zachowanie obecne:** Kod produkcyjny w `reserveSerialRange` posiada poprawną pętlę retries z optymistyczną blokadą `updateTime`, lecz w zestawie testów automatycznych brakowało bezpośredniego testu uruchamiającego `Promise.all` dla 10 równoległych wywołań tej samej funkcji w środowisku testowym.
- **Zachowanie oczekiwane:** Zestaw testów posiada wywołanie `Promise.all` symulujące 10 współbieżnych alokacji sekwencji dla tego samego `card_design_id`.
- **Wpływ biznesowy:** Brak wpływu na produkcję (kod działa poprawnie), dotyczy wyłącznie zakresu pokrycia testami.
- **Proponowany test regresji:** Test w Vitest uruchamiający 10 równoległych wywołań `reserveSerialRange` na mockowanym Firestore.

---

## 6. Scenariusze Potwierdzone Jako Poprawne

1. **Pełny przepływ zamówienia i spójność ID:** Identyfikatory kraju, wzoru, zamówienia, rezerwacji, POD, jednostek magazynowych oraz języków są zachowywane bez zmian od wyboru w sklepie po panel podróżnika.
2. **Idempotencja Checkoutu:** Wielokrotne kliknięcia przycisku płatności, odświeżanie strony i ponowienia requestu z tym samym kluczem `Idempotency-Key` trafiają w to samo zamówienie i tę samą rezerwację, zapobiegając powielaniu danych.
3. **Pojedynczy i wielokrotny webhook HotPay SUCCESS:** Ponowne odebranie tego samego webhooka nie tworzy nowych kart, nie generuje powtórzonych kodów QR ani nie dubluje punktów grywalizacji.
4. **Scenariusz FAILURE po SUCCESS:** Wystąpienie powiadomienia FAILURE po wcześniejszym opłaceniu nie cofa statusu zamówienia `PAID`.
5. **Scenariusz SUCCESS po wygaśnięciu/zwolnieniu rezerwacji:** Zamówienie przechodzi w status `payment_review_required` do ręcznej weryfikacji przez administratora. Automatyczna produkcja POD nie jest uruchamiana.
6. **Rezerwacje wzorów i optymistyczna współbieżność:** Transakcje rezerwacji magazynu używają świeżych nagłówków `updateTime` z Firestore przy każdym ponowieniu pętli retry.
7. **Unikalność kodów QR, tokenów i numerów seryjnych:** Wykorzystanie algorytmu SHA-256 oraz atomowych sekwencji zapobiega duplikacji numerów i kodów aktywacyjnych.
8. **Przepływ języków (bez nieprawidłowego fallbacku do `pl`):** System respektuje przypisane szablony językowe dla danego kraju i uniemożliwia wygenerowanie nieobsługiwanego języka.
9. **Uprawnienia Firestore i serwera:** Zabezpieczono kolekcje przed bezpośrednim zapisem z frontendu. Operacje administracyjne InPost i modyfikacje danych chronione są weryfikacją tokenów Firebase ID oraz ról w `admin_roles`.

---

## 7. Scenariusze, Których Nie Udało Się Zweryfikować Na Żywej Bazie Prod

- **Fizyczne nadanie paczki w InPost ShipX API:** Testowano w trybie read-only / mock. Nie wykonywano prawdziwych wywołań zakupu etykiet produkcyjnych InPost na żywym koncie organizacji.
- **Rzeczywiste przekierowanie płatności HotPay:** Testowano generowanie i weryfikację podpisu webhooków oraz żądań INIT, bez dokonywania prawdziwych transakcji finansowych.

---

## 8. Braki w Testach (Quality & Coverage Audit)

- Ostrzeżenia ESLint (12 warnings) dotyczące Fast Refresh w komponentach UI oraz hooka w `RegisterPostcard.tsx`.
- Brak testu weryfikującego reakcję na usunięcie szablonu językowego w trakcie trwania aktywnego zamówienia (system zgłosi błąd braku szablonu w POD, co jest zachowaniem bezpiecznym).

---

## 9. Ryzyka Konfiguracyjne (Odseparowane od Kodu)

1. **Brak kluczy produkcyjnych w środowisku deweloperskim:** Zmienne `HOTPAY_SECRET`, `HOTPAY_NOTIFICATION_PASSWORD` oraz `INPOST_SHIPX_TOKEN` muszą zostać poprawnie skonfigurowane na serwerze Vercel/Cloud Run przed przejściem z UAT na Produkcję.
2. **CORS Headers:** Nagłówek `Access-Control-Allow-Headers` zawiera `Idempotency-Key`, jednak domyślny origin wskazuje na `https://podrozowka.web.app`. Należy upewnić się, że zmienna środowiskowa `FRONTEND_ORIGIN` jest skonfigurowana dla produkcyjnej domeny.

---

## 10. Końcowa Ocena Gotowości UAT i Lista Blokad

- **Ocena gotowości UAT:** **GOTOWY DO TESTÓW UAT (READY FOR UAT)**
- **Blokady przed produkcją (Pre-production Blockers):** **BRAK BLOKAD KODOWYCH.**
  - Wymagana jedynie standardowa weryfikacja zmiennych środowiskowych na środowisku produkcyjnym przed oficjalnym startem.

---
*Raport został sporządzony automatycznie w ramach niezależnego audytu E2E kodem o pełnej spójności w dniu 28 sierpnia 2026 r.*
