# RAPORT WERYFIKACJI I AUDYTU POD FENCING & RECOVERY

**Repozytorium:** KDZFoundation/podrozowka-uat
**Gałąź:** main
**Commit:** 7edfdb19624d486e8fe419a33408382c53f877ab
**Status weryfikacji commita:** POTWIERDZONY — gałąź `origin/main` wskazuje dokładnie na commit `7edfdb19624d486e8fe419a33408382c53f877ab`.

---

## 1. Weryfikacja Automatyczna

Wszystkie polecenia automatyczne zostały uruchomione w środowisku weryfikacyjnym.

| Polecenie | Exit Code | Wynik / Liczba Testów | Ostrzeżenia vs Błędy |
| :--- | :---: | :--- | :--- |
| `npm run typecheck` | **0** | Sukces (0 błędów TypeScript) | 0 błędów, 0 ostrzeżeń |
| `npm run lint` | **0** | Sukces ESLint | 0 błędów, 12 ostrzeżeń Fast Refresh / Hook deps |
| `npm test` | **0** | **87 zaliczonych**, **0 niezaliczonych**, **3 pominięte** (22 pliki zaliczone, 1 pominięty) | Ostrzeżenia deprecacji `punycode` i React Router v7 |
| `npm run test:integration` | **0** | **3 zaliczone** (Firestore Emulator) | 0 błędów |
| `npm run build` | **0** | Sukces (Vite + esbuild bundle server.cjs) | Ostrzeżenia rozmiaru chunków (>500 kB) |

---

## 2. Lease Fencing — Dwóch Pracowników (Worker A i Worker B)

Przeanalizowano krok po kroku wywoływanie `preparePaidOrderPod` oraz `renewPodJobLease` w przypadku zatrzymania Workera A i przejęcia lease przez Workera B:

### Analiza miejsc zatrzymania Workera A:
1. **Przed rezerwacją numerów seryjnych (`reserveSerialRange`):**
   Worker A wywołuje `reserveSerialRange` (linia 336) **przed** wywołaniem `renewPodJobLease` (linia 338). Jeśli lease wygasł, Worker A i tak zaktualizuje dokument `inventory_serial_sequences`, po czym w linii 338 rzuci błąd `pod_job_lease_lost`. Zarezerwowane numery pozostają nieużyte (wyciek numeracji).
2. **Po rezerwacji numerów, przed `stock_batch`:**
   Worker A wywołuje `renewPodJobLease` w linii 338. Jeśli Worker B przejął lease, zapytanie rzuca wyjątek `pod_job_lease_lost`. Worker A zatrzymuje się i nie tworzy `stock_batch`.
3. **Przed i po utworzeniu `stock_batch`:**
   `createIfMissing` dla `stock_batches` (linia 339) używa `createDocumentWrite` (`exists: false`). Nie weryfikuje tokena lease. Jeśli Worker B zdążył utworzyć batch, zapis Workera A zgłasza błąd `ALREADY_EXISTS`, co jest wyłapywane bez naruszenia danych. Jeśli Worker B jeszcze go nie utworzył, Worker A utworzy batch, ale w następnym kroku pętli (linia 357) rzuci `pod_job_lease_lost`.
4. **Przed i po utworzeniu `inventory_unit`:**
   Linia 357 sprawdzająca lease wykonuje się przed utworzeniem jednostki. Jeśli jednak Worker A zatrzyma się **po** linii 357, a przed liniami 401–405, Worker B może w tym czasie przejąć lease i utworzyć jednostkę. Worker A po wznowieniu wykonuje `updateDocument` w liniach 401–405 bez weryfikacji lease i bez warunku CAS `updateTime`!
5. **Podczas uzupełniania tokenu istniejącej jednostki:**
   **LUKA BEZPIECZEŃSTWA:** Jeśli istniejąca jednostka nie ma `public_claim_token`, Worker A generuje nowy token i wywołuje `updateDocument` (linie 401–405). Ta operacja nie sprawdza `recovery_lease_id` ani nie stosuje warunku wersji. Worker A może nadpisać token i hash jednostki utworzonej/odzyskanej przez Workera B!
6. **Przed i po utworzeniu `qr_print_job_item`:**
   Tworzenie `qr_print_job_item` (linia 410) korzysta z `createIfMissing`. Jeśli Worker B utworzył już ten element, zapis Workera A jest ignorowany. Jeśli nie utworzył, Worker A utworzy go z wygenerowanym przez siebie tokenem.
7. **Przed aktualizacją `generated_items` oraz przed gotowością (`ready`):**
   Aktualizacje `generated_items` oraz statusu `ready` (linie 418 oraz 422) odbywają się poprzez `renewPodJobLease`. Wywłaszczony Worker A rzuca w tym miejscu błąd i nie ustawia statusu `ready`.

### Odpowiedzi na pytania szczegółowe (Uprawnienia Workera A po utracie lease):
- **Zarezerwować kolejne numery seryjne:** **TAK** (gdyż `reserveSerialRange` wykonuje się przed weryfikacją lease).
- **Utworzyć lub zmienić `stock_batch`:** **TAK** (jeśli wywłaszczenie nastąpi po linii 338, a przed 339;zmiana istniejącego batcha nie zachodzi).
- **Utworzyć albo zmodyfikować `inventory_unit`:** **TAK** (może utworzyć brakującą lub zmodyfikować pole tokenu/hasha istniejącej jednostki).
- **Zmienić `public_claim_token` lub jego hash:** **TAK** (poprzez `updateDocument` w liniach 401–405).
- **Utworzyć `qr_print_job_item` z innym tokenem:** **TAK** (jeśli element nie istniał).
- **Nadpisać `generated_items`:** **NIE** (chronione przez `renewPodJobLease`).
- **Ustawić zadanie jako `ready`:** **NIE** (chronione przez `renewPodJobLease`).
- **Zmienić dane utworzone przez Workera B:** **TAK** (może nadpisać hash w `inventory_unit` nowo wygenerowanym tokenem).

---

## 3. Token QR i Odzyskiwanie Starszych Danych

Przeanalizowano przypadki odzyskiwania oraz strukturę tokenów i bezpiecznych haszy:

- **Nowa `inventory_unit`:** Tworzony jest losowy token (64 znaki hex), w `inventory_units` zapisywany jest surowy token oraz jego SHA-256 hash. `qr_print_job_items` otrzymuje URL `/r/{token}`. Zgodność pełna.
- **Istniejąca jednostka z `public_claim_token` i hashem:** System odczytuje surowy token z jednostki i nie generuje nowego. Zgodność pełna.
- **Istniejąca jednostka tylko z hashem, bez surowego tokenu (KRYTYCZNY PROBLEM P0):**
  W liniach 399–406, jeśli `public_claim_token` nie występuje, kod **generuje nowy token** i wywołuje `updateDocument`, nadpisując `public_claim_token_hash` nową wartością `sha256(new_token)`. Jeśli fizyczny kod QR został już wydrukowany z poprzednim tokenem (lub `qr_print_job_items` zawierał Stary URL `/r/old_token`), skanowanie kodu QR przez obdarowanego kończy się błędem 404!
- **Istniejąca jednostka bez tokenu i bez `qr_print_job_item`:** Generowany jest nowy token, zapisywany w jednostce oraz w job itemie. Zgodność zachowana pod warunkiem braku wcześniejszego wydruku.
- **Istniejąca jednostka bez tokenu, ale z istniejącym `qr_print_job_item`:**
  `preparePaidOrderPod` generuje nowy token i nadpisuje hash w `inventory_unit`. `createIfMissing` dla `qr_print_job_item` pomija zapis (bo dokument istnieje z `/r/old_token`). W efekcie URL w QR kradnie stary token, a jednostka ma hash nowego tokena — skanowanie NIE DZIAŁA.
- **Równoległe odzyskiwanie tej samej jednostki:**
  Dwa procesy mogą wygenerować dwa różne tokeny, z których jeden zapisze swój hash w `inventory_units`, a drugi utworzy `qr_print_job_item`.
- **Rotacja lub usunięcie `HOTPAY_SECRET`:**
  Generowanie tokenów QR i ich hashy bazuje na `crypto.randomBytes(32)` i `sha256`, bez użycia `HOTPAY_SECRET`. Rotacja sekretu HotPay nie unieważnia kodów QR.
- **Prywatność i Firestore Rules:**
  W `firestore.rules` dostęp do `inventory_units` jest zastrzeżony dla administratorów i właściciela zamówienia (`traveler_user_id`). Surowy token jest wykorzystywany w ścieżce `/r/{token}`, a rejestracja odbywa się po stronie serwera (`server/routes/register-postcard.ts`), który przelicza token na SHA-256. Surowy token nie jest dostępny publicznie w regułach klienckich.

---

## 4. Operacje Create-Only (`createIfMissing` i `createDocumentWrite`)

Przeanalizowano działanie funkcji `createIfMissing` dla `stock_batches`, `inventory_units` i `qr_print_job_items`:

1. **Równoczesne utworzenie tego samego dokumentu:** Firestore `:commit` z warunkiem `currentDocument: { exists: false }` gwarantuje atomowość. Jeden zapis przechodzi (200 OK), drugi rzuca `ALREADY_EXISTS`. `createIfMissing` wyłapuje błąd, sprawdza istnienie dokumentu i zwraca `false`.
2. **Timeout po skutecznym zapisie:** Jeśli odpowiedź HTTP ginie w sieci, `createIfMissing` przechodzi do bloku `catch`, wykonuje `readDocument`, potwierdza istnienie dokumentu i zwraca `false`, pozwalając na bezpieczną kontynuację.
3. **Przejściowe błędy Firestore i uprawnienia (503 / 403):** W przypadku braku dostępu lub awarii bazy `readDocument` również rzuca błąd (lub zwraca `null`), co powoduje ponowne rzucenie pierwotnego wyjątku. Błędy nie są maskowane.
4. **Dokument istniejący, lecz niekompletny / Dane ręcznie zmienione:**
   `createIfMissing` zachowuje istniejący dokument. Jeśli jednak brakuje pola `public_claim_code`, kod rzuca wyjątek `pod_inventory_unit_missing_claim_code`.

---

## 5. Numery Seryjne i Limity Zapytań

- **Brak duplikatów przy równoległych rezerwacjach:** Funkcja `reserveSerialRange` wykorzystuje CAS (`updateDocumentWrite` z `updateTime` lub `createDocumentWrite` z `exists: false`) oraz do 12 prób powtórzenia (`MAX_SERIAL_RETRIES`). Równoległe rezerwacje przydzielają nieprzecinające się zakresy.
- **Wyciek numeracji przy utracie lease:** `reserveSerialRange` jest wywoływane **przed** `renewPodJobLease`. Utrata lease bezpośrednio po rezerwacji powoduje powstawanie luk w numeracji seryjnej.
- **Limit 500 dokumentów w `queryDocuments`:**
  W `api/_lib/pod-order.ts` (linia 70), w przypadku braku dokumentu sekwencji `inventory_serial_sequences`, wykonywane jest zapytanie fallback: `queryDocuments("inventory_units", "card_design_id", ...)` z domyślnym limitem 500. Jeśli dany wzór kartki posiada ponad 500 wygenerowanych sztuk, zapytanie nie zwróci nowszych dokumentów, co spowoduje obliczenie zaniżonego numeru startowego i **duplikację numerów seryjnych**.

---

## 6. Grywalizacja i Powiadomienia

Przeanalizowano `awardPurchaseGamification` oraz `ensurePurchaseNotifications`:

1. **Idempotentność punktów i rang:** Punkty oraz awans są przyznawane w transakcji atomowej `commitWrites` na dokumentach `orders` i `users` pod warunkiemsprawdzenia `order.gamification_awarded_at`. Punkty nie są przyznawane wielokrotnie.
2. **Awaria po przyznaniu punktów:** Ponowne uruchomienie wykrywa `gamification_awarded_at` i wywołuje wyłącznie `ensurePurchaseNotifications`.
3. **Resetowanie statusu przeczytania powiadomień (PROBLEM P1):**
   `ensurePurchaseNotifications` korzysta z `setDocument("notifications", ...)`, które wykonuje `PATCH` na całym dokumencie **bez określenia `updateMask`**. Każde ponowne uruchomienie recovery lub ponowienie webhooka HotPay **resetuje stan `is_read` na `false`** dla powiadomień odczytanych już przez użytkownika!
4. **Zamówienia legacy bez zapisanych rang:** Dla zamówień starszych bez pola `gamification_previous_rank`, ponowne wywołanie może wygenerować błędne powiadomienie o awansie rangi.

---

## 7. Ocena Testów Automatycznych

Przeanalizowano plik `src/__tests__/pod-recovery.test.ts`:

- **Niedostateczna semantyka mocków:** Testy jednostkowe używają zaślepek `vi.fn()` zwracających statyczne obiekty JavaScript. Mocki **nie odwzorowują**:
  - konfliktów CAS `updateTime`,
  - wywłaszczenia `recovery_lease_id` przez innego workera w trakcie pętli,
  - zachowania po nadpisaniu tokenu/hasha,
  - zachowania pola `is_read` w powiadomieniach.
- **Kodyfikacja błędnego zachowania:** Test `keeps an already-created inventory unit and only recreates its missing print item` w linii 144 bezpośrednio oczekuje, że `updateDocument` zostanie wywołane do nadpisania `public_claim_token` i `public_claim_token_hash`. Test uznawał uszkadzanie hashy za zachowanie poprawne.

---

## 8. Wymagane Niezmienniki

| # | Niezmiennik | Status | Uzasadnienie |
| :-: | :--- | :-: | :--- |
| 1 | Jedno zamówienie tworzy najwyżej jeden print job. | **PASS** | `jobId` jest deterministyczny, a tworzenie chronione warunkiem `exists: false`. |
| 2 | Każda zakupiona sztuka ma dokładnie jedną `inventory_unit`. | **PASS** | `unitId` jest deterministyczny (`pod-unit:{orderId}:{itemIndex}:{copyIndex}`). |
| 3 | Każda jednostka ma dokładnie jeden `qr_print_job_item`. | **PASS** | `itemId` jest deterministyczny (`pod-job-item:{orderId}:{itemIndex}:{copyIndex}`). |
| 4 | Kod i numer seryjny jednostki nie zmieniają się podczas recovery. | **PASS** | Kod oraz numer seryjny są zachowywane z odczytanej jednostki. |
| 5 | Token z wydrukowanego QR zawsze odpowiada hashowi jednostki. | **FAIL** | Recovery jednostki z brakiem `public_claim_token` nadpisuje hash nowym tokenem, rozłączając go z wydrukowanym kodem QR. |
| 6 | Stary worker po utracie lease nie może modyfikować wyniku nowego workera. | **FAIL** | Wywołania `updateDocument` oraz `createIfMissing` wewnątrz pętli nie weryfikują `recovery_lease_id`. |
| 7 | Recovery nie nadpisuje ręcznych danych magazynowych. | **PARTIAL** | Zachowuje większość pól, ale nadpisuje `public_claim_token_hash` przy braku pola surowego tokenu. |
| 8 | Status `ready` występuje dopiero po utworzeniu wszystkich jednostek i QR. | **PASS** | Ustawienie statusu `ready` następuje na samym końcu pętli po przetworzeniu wszystkich pozycji. |
| 9 | Punkty oraz awans są przyznawane najwyżej raz. | **PASS** | Chronione flaga `gamification_awarded_at` i transakcją CAS `updateTime`. |
| 10 | Recovery powiadomień nie przywraca `is_read=false`. | **FAIL** | `ensurePurchaseNotifications` używa `setDocument`, bezwarunkowo nadpisując `is_read` na `false`. |
| 11 | Rotacja `HOTPAY_SECRET` nie unieważnia istniejących kodów QR. | **PASS** | Kody QR bazują na osobnych losowych tokenach SHA-256. |
| 12 | Obsługiwane są zamówienia na maksymalną dozwoloną liczbę sztuk. | **PARTIAL** | Limit 500 sztuk w zamówieniu jest egzekwowany, ale zapytanie fallback rezerwacji numerów ma sztywny limit 500 dokumentów. |

---

## 9. Potwierdzone Problemy (Lista Defektów)

### [P0] Uszkadzanie hashy tokenów QR podczas recovery jednostek z brakiem surowego tokenu
- **Priorytet:** P0 (Krytyczny)
- **Pewność:** Wysoka
- **Plik i linie:** `api/_lib/pod-order.ts`, linie 399–406
- **Warunki początkowe:** Istnieje `inventory_unit` z zapisanym `public_claim_token_hash` (lub utworzona przez Workera B), ale z brakiem pola `public_claim_token`. Istnieje już `qr_print_job_item` z adresem `/r/token_orig`.
- **Przeplot operacji:** Worker A wykonuje recovery -> odczytuje jednostkę -> widzi brak surowego tokenu -> generuje nowy token -> wywołuje `updateDocument` nadpisując `public_claim_token_hash` nowym hashem -> `createIfMissing` dla `qr_print_job_item` pomija zapis, zostawiając stary URL `/r/token_orig`.
- **Zachowanie obecne:** Baza danych zawiera hash nowego tokenu, a kod QR na wydruku zawiera stary token.
- **Zachowanie oczekiwane:** System nie może nadpisywać `public_claim_token_hash`. Jeśli surowy token nie występuje, powinien odzyskać token z istniejącego `qr_print_job_items` lub zachować istniejący hash.
- **Wpływ biznesowy:** Klient/Obdarowany skanujący fizyczny kod QR otrzymuje błąd 404 "Kartka nie znaleziona".
- **Minimalna poprawka:** Przed wygenerowaniem nowego tokenu odzyskać surowy token z `/r/{token}` w istniejącym `qr_print_job_items`. Jeśli niedostępny, nie nadpisywać istniejącego `public_claim_token_hash`.
- **Test regresyjny:** Test symulujący recovery jednostki z istniejącym `qr_print_job_items` i brakiem surowego tokena w `inventory_units`, weryfikujący niezmienność `public_claim_token_hash`.

### [P1] Brak weryfikacji lease wewnątrz pętli zapisu jednostek i QR items
- **Priorytet:** P1 (Wysoki)
- **Pewność:** Wysoka
- **Plik i linie:** `api/_lib/pod-order.ts`, linie 401–405, 410–417
- **Warunki początkowe:** Worker A posiada lease, po czym doznaje przestoju. Lease wygasa, Worker B przejmuje zadanie. Worker A budzi się wewnątrz pętli.
- **Przeplot operacji:** Worker A po wygasnięciu lease wykonuje `updateDocument` na `inventory_units` oraz `createIfMissing` na `qr_print_job_items` przed sprawdzeniem `renewPodJobLease`.
- **Zachowanie obecne:** Wywłaszczony Worker A modyfikuje dane utworzone przez Workera B.
- **Zachowanie oczekiwane:** Każdy zapis musi być chroniony sprawdzaniem aktualności lease.
- **Wpływ biznesowy:** Niespójność danych i możliwość uszkodzenia prac nowego workera.
- **Minimalna poprawka:** Powiązać zapisy w pętli z weryfikacją `recovery_lease_id` w ramach batcha/transakcji Firestore.
- **Test regresyjny:** Test z mockiem zmieniającym `recovery_lease_id` podczas wykonania pętli.

### [P1] Resetowanie pola `is_read` powiadomień na `false` przy powtórnym uruchomieniu
- **Priorytet:** P1 (Wysoki)
- **Pewność:** Wysoka
- **Plik i linie:** `api/_lib/pod-order.ts`, linie 118–142, 147–156
- **Warunki początkowe:** Użytkownik odczytał powiadomienie o zakupie (`is_read: true`).
- **Przeplot operacji:** Ponowne nadejście webhooka HotPay lub wywołanie recovery uruchamia `ensurePurchaseNotifications`, które wywołuje `setDocument` na dokumentach `notifications`.
- **Zachowanie obecne:** `setDocument` wykonuje `PATCH` całego dokumentu, przywracając `is_read: false`.
- **Zachowanie oczekiwane:** Powiadomienie powinno być tworzone wyłącznie wtedy, gdy nie istnieje (`createIfMissing`).
- **Wpływ biznesowy:** Powracające nieprzeczytane powiadomienia u użytkowników.
- **Minimalna poprawka:** Zamiana `setDocument` na `createIfMissing` dla kolekcji `notifications`.
- **Test regresyjny:** Wywołanie `ensurePurchaseNotifications` dla istniejącego powiadomienia z `is_read: true`.

### [P2] Wyciek numeracji seryjnej przy utracie lease przed rezerwacją
- **Priorytet:** P2 (Średni)
- **Pewność:** Wysoka
- **Plik i linie:** `api/_lib/pod-order.ts`, linie 336–338
- **Warunki początkowe:** Utrata lease następuje tuż przed linią 336.
- **Przeplot operacji:** Worker A wykonuje `reserveSerialRange`, inkrementując sekwencję w bazie, po czym rzuca błąd w `renewPodJobLease` (linia 338).
- **Zachowanie obecne:** Powstają luki w wygenerowanych numerach seryjnych.
- **Zachowanie oczekiwane:** Rezerwacja zakresu następuje po weryfikacji lease.
- **Minimalna poprawka:** Przeniesienie `renewPodJobLease` przed `reserveSerialRange`.

### [P2] Ryzyko duplikacji numerów seryjnych przy sekwencji fallback z limitem 500
- **Priorytet:** P2 (Średni)
- **Pewność:** Średnia
- **Plik i linie:** `api/_lib/pod-order.ts`, linia 70; `api/_lib/gcp-firestore.ts`, linia 200
- **Warunki początkowe:** Brak dokumentu `inventory_serial_sequences`, liczba sztuk danego wzoru > 500.
- **Przeplot operacji:** Fallback `reserveSerialRange` wykonuje `queryDocuments` bez sortowania z limitem 500.
- **Zachowanie obecne:** Wyliczany max ze zwróconej 500-tki jest zaniżony, powracają istniejące numery.
- **Zachowanie oczekiwane:** Zapytanie z sortowaniem `orderBy: DESC` i `limit: 1`.
- **Minimalna poprawka:** Dodanie sortowania malejącego po `inventory_serial_no`.

---

## 10. Tabela Wyników Komend

| Polecenie | Status | Exit Code | Uwagi |
| :--- | :---: | :---: | :--- |
| `npm run typecheck` | **PASS** | 0 | Brak błędów typowania TypeScript. |
| `npm run lint` | **PASS** | 0 | 12 ostrzeżeń Fast Refresh / React Hook deps. |
| `npm test` | **PASS** | 0 | 87 zaliczonych, 3 pominięte (Firestore emulator unit tests). |
| `npm run test:integration` | **PASS** | 0 | 3 zaliczone w emulacji Firestore. |
| `npm run build` | **PASS** | 0 | Pomyślny build Vite oraz bundler `server.cjs`. |

---

## 11. Lista Brakujących Testów

1. **Test odzyskiwania tokenu z `qr_print_job_items`:** Weryfikacja, że przy braku `public_claim_token` w `inventory_units` hash nie ulega zmianie, a token jest odzyskiwany z URL job itema.
2. **Test symulacji wywłaszczenia lease w trakcie pętli:** Test weryfikujący, że Worker A po utracie lease nie modyfikuje `inventory_units` ani `qr_print_job_items`.
3. **Test trwałości statusu `is_read` powiadomień:** Test sprawdzający, że ponowne wywołanie `awardPurchaseGamification` / `ensurePurchaseNotifications` nie zmienia `is_read: true` na `false`.
4. **Test fallbacku rezerwacji sekwencji przy >500 dokumentach:** Test sprawdzający wyliczanie kolejnego numeru seryjnego przy dużej liczbie istniejących jednostek.

---

## 12. Ocena Gotowości

### **NO-GO**

**Uzasadnienie:**
Mimo że wszystkie komendy kompilacji i testy automatyczne przechodzą pomyślnie (`PASS`), audyt adversarialny wykrył **krytyczny defekt P0** w logice odzyskiwania danych (nadpisywanie hashy tokenów nowymi losowymi wartościami, co unieważnia fizyczne kody QR) oraz **defekty P1** w fencing lease i resetowaniu statusu powiadomień. Przyjęcie zmian w obecnym stanie grozi wydrukiem niedziałających kodów QR dla klientów oraz brakiem spójności danych przy równoległym odzyskiwaniu.

---

## 13. Top 5 Kolejnych Działań (Uporządkowane według Ryzyka)

1. **[Ryzyko Krytyczne] Naprawa odzyskiwania tokenów w `preparePaidOrderPod`:**
   Zmienić logikę w liniach 399–406: jeśli w `inventory_units` brakuje surowego tokenu, odczytać go z istniejącego `qr_print_job_items` (z `qr_url`). Jeśli niedostępny, bezwzględnie zachować istniejący `public_claim_token_hash`.
2. **[Ryzyko Wysokie] Uszczelnienie fencing lease dla operacji zapisu:**
   Zabezpieczyć wywołania `updateDocument` oraz `createIfMissing` wewnątrz pętli generowania jednostek weryfikacją `recovery_lease_id` (np. poprzez batch transakcyjny z warunkiem na dokumencie zadania).
3. **[Ryzyko Wysokie] Zmiana sposobu zapisu powiadomień w `ensurePurchaseNotifications`:**
   Zastąpić bezwarunkowe `setDocument` funkcją `createIfMissing`, aby zapobiec przywracaniu statusu `is_read: false` na odczytanych powiadomieniach.
4. **[Ryzyko Średnie] Kolejność rezerwacji numerów seryjnych (`reserveSerialRange`):**
   Przenieść wywołanie `renewPodJobLease` przed `reserveSerialRange`, zapobiegając wyciekom zakresów numerów seryjnych po utracie lease.
5. **[Ryzyko Średnie] Naprawa zapytania fallback w `reserveSerialRange`:**
   Dodać sortowanie malejące po `inventory_serial_no` z limitem 1, eliminując ryzyko duplikacji numerów przy braku dokumentu sekwencji.
