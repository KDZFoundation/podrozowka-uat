# Raport z Audytu Odporności na Powtórzenia, Równoległe Wywołania i Idempotencję (Gałąź `main`)

**Data audytu:** 28 sierpnia 2024
**Środowisko runtime:** Node.js / Vercel Serverless / Firebase Firestore (`GCP Firestore REST API`)
**Zakres audytu:**
- Tworzenie płatności HotPay (ponowienie checkoutu, błędy bramki, duplikacja zamówienia)
- Webhook HotPay (ten sam SUCCESS wielokrotnie, SUCCESS po FAILURE, kwota i waluta)
- Przygotowanie POD, kody QR oraz jednostki magazynowe po podwójnym webhooku / race condition
- Rezerwacje wzorów: potwierdzenie, zwolnienie, wygaśnięcie i wyścigi (concurrency)
- Generowanie numerów/kodów przy równoległych zakupach
- Idempotencja między endpointami Vercel/Express i Firestore

---

## Podsumowanie wyników audytu

Po przeanalizowaniu kodu źródłowego zidentyfikowano **5 potwierdzonych problemów (P0–P3)** związanych z wyścigami (race conditions), brakiem idempotencji oraz brakiem atomowych transakcji w bazie Firestore. Wszystkie testy automatyczne (`npm test`), typecheck (`npm run typecheck`) oraz linter (`npm run lint`) zostały uruchomione i potwierdzają aktualny stan kodu.

---

## Zidentyfikowane problemy P0–P3

### 1. [P0] Brak atomowej blokady wyścigu przy podwójnym/równoległym webhooku SUCCESS – ryzyko wielokrotnego naliczania punktów gamifikacji oraz kolizji numerów seryjnych POD

- **Plik i linia:**
  - `server/routes/payments/hotpay-webhook.ts`: linie 90–108
  - `api/_lib/pod-order.ts`: linie 58–70, 103–105, 180–225
- **Kroki odtworzenia:**
  1. Wysłać dwa współbieżne żądania `POST /api/payments/hotpay-webhook` ze stanem `STATUS=SUCCESS` dla tego samego zamówienia `ID_ZAMOWIENIA`.
  2. Oba żądania przechodzą weryfikację podpisu HASH i równolegle odczytują ten sam dokument zamówienia z Firestore (`readDocument("orders", orderId)`).
  3. Oba żądania sprawdzają `existingJobs` w `api/_lib/pod-order.ts` (linia 59). Ponieważ żaden z jobów nie ma jeszcze statusu `"ready"`, oba wywołania przechodzą dalej.
  4. Równolegle wyliczany jest `maxSerial` dla jednostek magazynowych (`inventory_units`), co prowadzi do próby wygenerowania tych samych numerów seryjnych.
  5. Oba żądania odczytują konto użytkownika (`readDocument("users", userId)`) i dodają punkty gamifikacji (`userData.gamification_points + addedPoints`).
- **Stan obecny:**
  Wykonywana jest nieatomowa operacja odczyt-modyfikacja-zapis. Dwa równoległe webhooki naliczają punkty użytkownikowi dwukrotnie (np. +200 pkt zamiast +100 pkt) oraz nadpisują dane jednostek magazynowych i statystyk.
- **Stan oczekiwany:**
  Obsługa webhooka musi używać atomowej transakcji Firestore lub warunku wstępnego (`currentDocument.updateTime` / unikalny stan `payment_status != 'paid'`). W przypadku powtórzonego lub równoległego webhooka drugie żądanie powinno zostać zignorowane (idempotentność).
- **Proponowany test regresji (`src/__tests__/hotpay-webhook-concurrency.test.ts`):**
  Wywołać `preparePaidOrderPod` / `hotpay-webhook` dwa razy równolegle (`Promise.all([fetch1, fetch2])`) dla tego samego zamówienia i zweryfikować, że punkty gamifikacji użytkownika oraz liczba wygenerowanych jednostek `inventory_units` zwiększyły się dokładnie raz.

---

### 2. [P1] Odblokowanie rezerwacji i akceptacja webhooka SUCCESS po FAILURE bez ponownej weryfikacji i rezerwacji stanu magazynowego

- **Plik i linia:**
  - `server/routes/payments/hotpay-webhook.ts`: linie 104–120
  - `api/_lib/design-reservation.ts`: linie 105–128
- **Kroki odtworzenia:**
  1. HotPay wysyła webhook `STATUS=FAILURE` (np. anulowanie płatności przez użytkownika).
  2. Endpoint w `hotpay-webhook.ts` zmienia `payment_status` na `"failed"` i wywołuje `updateReservationStatus(reservationId, "released")`, co natychmiastowo zeruje/zmniejsza `reserved_quantity` wzoru w `card_designs`.
  3. Inny klient kupuje ostatnią dostępną sztukę z magazynu.
  4. HotPay z opóźnieniem wysyła webhook `STATUS=SUCCESS` (lub powiadomienie o spóźnionej wpłacie).
  5. `hotpay-webhook.ts` przyjmuje `SUCCESS`, ustawia status zamówienia na `paid` i generuje jednostki POD/magazynowe, mimo że towar został w międzyczasie wyprzedany.
- **Stan obecny:**
  Webhook `SUCCESS` po `FAILURE` bezkrytycznie zmienia status zamówienia na `paid` i potwierdza rezerwację, która została wcześniej zwolniona (`released`), doprowadzając do wyprzedania ponad stan (overselling) przy limitowanych magazynowo produktach (inventory_type `stock` / `hybrid`).
- **Stan oczekiwany:**
  Przed przetworzeniem `SUCCESS` dla zamówienia ze statusem `payment_failed` system musi zweryfikować, czy rezerwacja jest nadal aktywna (`pending`). Jeśli została zwolniona, należy spróbować ponownie zarezerwować stan magazynowy lub oznaczyć płatność jako wymagającą ręcznej weryfikacji / zwrotu (`payment_review_required`).
- **Proponowany test regresji (`src/__tests__/hotpay-success-after-failure.test.ts`):**
  Zsymulować odebranie webhooka `FAILURE`, a następnie `SUCCESS` dla tego samego zamówienia z fizycznym stanem magazynowym równym 0 i sprawdzić, czy system zapobiega nieuprawnionej realizacji zamówienia bez pokrycia w stanie magazynowym.

---

### 3. [P1] Generowanie numerów zamówień w oparciu o czas systemowy oraz brak nagłówka idempotencji przy tworzeniu płatności

- **Plik i linia:**
  - `server/routes/payments/create-hotpay.ts`: linia 80
- **Kroki odtworzenia:**
  1. Użytkownik klika przycisk "Zapłać" wielokrotnie (double-click) lub klaster wysyła dwa równoległe żądania `POST /api/payments/create-hotpay` z tym samym koszykiem w tej samej milisekudzie.
  2. Numer zamówienia jest generowany przez `const orderNumber = 'ORD-' + Date.now().toString(36).toUpperCase()`.
  3. Jeśli żądania wykonają się w tej samej milisekundzie, powstają dwa osobne zamówienia w Firestore (`orders`) o identycznym `order_number`, ale różnych `orderId` (UUID).
  4. Powstają dwie niezależne rezerwacje w `inventory_reservations`, podwójnie blokujące stan magazynowy.
- **Stan obecny:**
  Brak weryfikacji unikalności `order_number` przy zapisie oraz brak obsługi klucza idempotencji podawanego przez klienta (`Idempotency-Key` / `cart_id`).
- **Stan oczekiwany:**
  Generowanie `order_number` powinno zawierać zapasowy losowy sufiks (np. `ORD-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`). Endpoint powinen akceptować klucz idempotencji (lub identyfikator koszyka), aby powtórzone wywołanie zwracało istniejącą płatność zamiast tworzyć nowe zamówienie.
- **Proponowany test regresji (`src/__tests__/create-hotpay-idempotency.test.ts`):**
  Wysłać 5 równoległych żądań do `create-hotpay` z tym samym koszykiem i zweryfikować, że nie dochodzi do kolizji `order_number` ani podwójnej rezerwacji stoku.

---

### 4. [P2] Niepoprawna pętla ponowień (Retry Loop) w rezerwacji wzorów przy wyścigach (Concurrency)

- **Plik i linia:**
  - `api/_lib/design-reservation.ts`: linie 89–101
- **Kroki odtworzenia:**
  1. Dwa żądania zakupu współbieżnie wywołują `reserveDesignAvailability`.
  2. Oba odczytują dokument `card_designs` z tą samą wartością `snapshot.updateTime`.
  3. Pierwsze żądanie wykonuje `commitWrites` i sukcesywnie aktualizuje Firestore. `updateTime` dokumentu w Firestore ulega zmianie.
  4. Drugie żądanie otrzymuje błąd optymistycznej blokady (z powodu niezgodności `updateTime`).
  5. Pętla `for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1)` przechwytuje błąd i ponawia próbę.
- **Stan obecny:**
  Pętla `MAX_RETRIES` w `reserveDesignAvailability` wysyła dokładnie ten sam obiekt `snapshots` ze starym `snapshot.updateTime` bez ponownego odczytania dokumentu z Firestore! W efekcie wszystkie 3 próby (retry 1, 2, 3) natychmiast kończą się niepowodzeniem.
- **Stan oczekiwany:**
  Każde ponowienie w pętli retry musi ponownie odczytać aktualny stan `card_designs` z Firestore, zweryfikować dostępność stoku i zaktualizować warunek `updateTime`.
- **Proponowany test regresji (`src/__tests__/design-reservation-retry.test.ts`):**
  Zsymulować odrzucenie pierwszej próby zapisu z powodu `updateTime` i sprawdzić, czy funkcja w kolejnej próbie ponownie pobiera dane i poprawnie dokańcza rezerwację, jeśli stok jest wciąż dostępny.

---

### 5. [P3] Brak weryfikacji braku zmian stanu przed nadpisaniem (Missing Firestore Patch Preconditions) w trasach webhooków i aktualizacji zamówień

- **Plik i linia:**
  - `api/_lib/gcp-firestore.ts`: linie 137–142 (`updateDocument`)
  - `server/routes/payments/hotpay-webhook.ts`: linie 100–103, 115–118
- **Kroki odtworzenia:**
  1. Funkcja `updateDocument` wysyła żądanie `PATCH` do Firestore REST API zawierające wyłącznie `updateMask.fieldPaths`.
  2. Nie przekazuje nagłówka/warunku `currentDocument.updateTime` ani `currentDocument.exists`.
  3. W przypadku opóźnień sieciowych i odwrócenia kolejności pakietów (np. webhook `SUCCESS` dociera tuż przed opóźnionym webhookiem `FAILURE`), nowszy webhook `FAILURE` nadpisze stan zamówienia opłaconego `paid` na `payment_failed`.
- **Stan obecny:**
  Brak warunków wstępnych w `updateDocument` naraża stan zamówienia na uszkodzenie przy niekolejnym doręczeniu pakietów HTTP/webhooków.
- **Stan oczekiwany:**
  Wszystkie krytyczne aktualizacje stanu (np. zmiana statusu płatności zamówienia) powinny używać bezwzględnych warunków wstępnych (`currentDocument.updateTime`) lub operacji atomowych `:commit` z weryfikacją poprzedniego stanu.
- **Proponowany test regresji (`src/__tests__/firestore-update-preconditions.test.ts`):**
  Zweryfikować, że próba aktualizacji zamówienia ze starym `updateTime` zgłasza błąd i nie dopuszcza do nadpisania nowszego stanu opłaconego.

---

## Podsumowanie stanu weryfikacji

- **Typecheck (`tsc --noEmit`):** PASSED (0 błędów)
- **Unit & Integration Tests (`vitest`):** 76/76 PASSED (19 plików testowych)
- **Linter (`eslint .`):** PASSED (0 błędów, 12 ostrzeżeń UI)
