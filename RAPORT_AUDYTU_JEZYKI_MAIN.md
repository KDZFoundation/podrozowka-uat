# Raport Audytu Przepływu Języków — Gałąź `main` Repozytorium Podróżówki

**Data audytu:** 28 sierpnia 2026 r.
**Środowisko:** Gałąź `main` (repozytorium: `KDZFoundation/podrozowka-uat`)
**Zakres audytu:** Wyłącznie odczytowy audyt kompletnego przepływu języków (kraj, wzory kartki, sklep, koszyk, checkout, zamówienia, płatność HotPay, POD, generowanie PDF do drukarni, `inventory_units`, oraz rejestracja QR przez obdarowanego).

---

## Podsumowanie Wykonanych Prac Audytowych

Przeprowadzono pełną analizę kodu źródłowego (sklep, koszyk, checkout, panel administratora, backend Node/Express, Edge Functions Supabase, usługi Firestore i wygenerowane arkusze drukarskie POD SRA3 PDF).

Zweryfikowano kompilację typów TypeScript (`npm run typecheck`), zestaw 70 testów jednostkowych/integracyjnych Vitest (`npm test`) oraz reguły lintera ESLint (`npm run lint`).

---

## Wyniki Audytu wg Kryteriów Oceny (1–10)

### 1. Kraj ma jeden język podstawowy
- **Stan:** Działa poprawnie.
- **Opis:** Gdy kraj posiada dokładnie jeden szablon z flagą `is_primary = true` w `card_language_templates`, strona produktu (`ShopProduct.tsx`) automatycznie zaznacza go jako język podstawowy.

### 2. Kraj ma kilka języków, ale żaden nie jest podstawowy
- **Stan:** Działa w sklepie dla Podróżnika, ale posiada lukę w Panelu Admina (Wykryto Problem P2-01).
- **Opis:** W sklepie (`ShopProduct.tsx`) przy braku szablonu domyślnego użytkownik jest zobowiązany do ręcznego wyboru języka podstawowego z rozwijanej listy przed dodaniem kartki do koszyka. Jednak w Panelu Admina (`AdminCardCreator.tsx`) przy braku szablonu podstawowego system cicho przypisuje kod `"pl"`.

### 3. Kraj ma język podstawowy oraz języki dodatkowe
- **Stan:** Działa poprawnie.
- **Opis:** W sklepie oraz koszyku język dodatkowy jest opcjonalny. Zarówno w interfejsie użytkownika, jak i na poziomie bazy danych (Supabase RPC oraz Edge Functions), system uniemożliwia wybranie tego samego języka jako podstawowego i dodatkowego (`secondary_language_must_differ`).

### 4. Administrator tworzy i edytuje wzór kartki
- **Stan:** Działa częściowo (Wykryto Problem P2-01).
- **Opis:** Admin może wybierać szablony językowe i dostosowywać napisy dziękczynne oraz instrukcje QR. Zmiana szablonu ładuje domyślne napisy ze słownika.

### 5. Podróżnik zmienia język podstawowy i wybiera dodatkowy
- **Stan:** Działa poprawnie w koszyku i na stronie produktu.
- **Opis:** Wybór kombinacji języków tworzy unikalny wariant w koszyku (`cartLineId`). Zmiana języków w koszyku scala ilości z istniejącym wariantem lub tworzy nowy osobny wiersz zamówienia do druku.

### 6. Języki przechodzą przez cały proces (Sklep -> Koszyk -> Checkout -> Zamówienie -> Płatność -> POD -> PDF -> Inventory Units -> Rejestracja QR)
- **Stan:** Wykryto nieścisłości w backendzie Node.js (Wykryto Problem P1-01 i P1-02).
- **Opis:** Przepływ danych w Supabase Edge Functions jest spójny. Jednak w serwerowych trasach Node.js (`server/routes/payments/create-hotpay.ts` oraz `api/_lib/pod-order.ts`) występuje nadpisanie wybranego przez użytkownika języka podstawowego domyślnym językiem wzoru kartki.

### 7. Obdarowany może wybrać wyłącznie język dostępny dla danego kraju
- **Stan:** Działa poprawnie i jest zweryfikowane po stronie serwera.
- **Opis:** W trasie rejestracji (`server/routes/register-postcard.ts`) serwer odczytuje szablony dla kraju danej kartki i odrzuca kodem 400 (`invalid_language_for_country`) jakąkolwiek próbę przesłania niedozwolonego języka.

### 8. Miejsca z fallbackiem do "pl" i ocena ryzyka zapisania nieprawidłowego języka
- **Stan:** Wykryto ryzyko zapisania błędnego języka (Wykryto Problem P1-01, P1-02 oraz P2-01).
- **Miejsca fallbacku do `"pl"` w kodzie:**
  1. `server/routes/payments/create-hotpay.ts:46` — **Wysokie ryzyko (P1)**
  2. `api/_lib/pod-order.ts:93` — **Wysokie ryzyko (P1)**
  3. `src/components/admin/AdminCardCreator.tsx:260` — **Średnie ryzyko (P2)**
  4. `src/pages/Shop.tsx:160` oraz `src/pages/ShopProduct.tsx:96` — Niskie ryzyko (wyłącznie awaryjne wyświetlanie na UI).

### 9. Identyfikatory kraju i języka są zachowane po przejściu przez cały proces
- **Stan:** Identyfikatory są zachowywane, wykryto podatność na wielkość liter (Wykryto Problem P2-02).
- **Opis:** `country_id` i `language_code` przechodzą przez całą ścieżkę. Jednak w generatorze PDF `templateByCountryAndCode` klucz mapy wrażliwy jest na wielkość liter (np. `"JP:ja"` vs `"JP:JA"`), co przy braku znormalizowania kodu języka uniemożliwia pobranie tekstu dziękczynnego.

### 10. Przypadki usunięcia lub zmiany szablonu językowego użytego już przez istniejący wzór lub zamówienie
- **Stan:** Wykryto brak ochrony spójności (Wykryto Problem P2-03).
- **Opis:** Usunięcie szablonu językowego z poziomu Admina (`deleteLanguageTemplate`) nie sprawdza, czy dany język jest użyty w istniejących zamówieniach lub wierszach `inventory_units`. Usunięcie szablonu powoduje, że generator PDF dla wcześniej opłaconych kart przywraca domyślny tekst bazowy wzoru.

---

## Potwierdzone Problemy i Luki (Raport Błędów)

### [P1-01] Nadpisanie wybranego przez Podróżnika języka podstawowego w trasie płatności `create-hotpay`
- **Priorytet:** P1 (Wysoki)
- **Plik i linia:** `server/routes/payments/create-hotpay.ts:46`
- **Sposób odtworzenia:**
  1. Podróżnik dodaje do koszyka kartkę z kraju posiadającego np. język hiszpański jako domyślny (`es`), ale zmienia na stronie produktu język podstawowy tej kartki na kataloński (`ca`).
  2. Przechodzi do Checkoutu i opłaca zamówienie przez trasę `POST /api/payments/create-hotpay`.
- **Obecne zachowanie:** Serwer wykonuje `primary_language_code: item.primary_language_code || String(data.language_code || "pl")`. Jeśli obiekt przedmiotu z żądania nie przekaże dokładnie właściwości `primary_language_code`, serwer pobiera `data.language_code` ze wzoru kartki w bazie (`"es"`), zignorowawszy wybór użytkownika (`"ca"`).
- **Oczekiwane zachowanie:** Serwer powinien bezwzględnie honorować język podstawowy wybrany przez kupującego w koszyku (`item.primary_language?.code` / `item.primary_language_code`).
- **Sugerowany test regresyjny:** Test jednostkowy dla `create-hotpay.ts` weryfikujący, że przy przesłaniu w pozycji zamówienia `primary_language_code: "ca"` dla wzoru o `language_code: "es"`, w utworzonym zamówieniu zostaje zapisany kod `"ca"`.

---

### [P1-02] Fallback do "pl" w tworzeniu jednostek POD backendu Node
- **Priorytet:** P1 (Wysoki)
- **Plik i linia:** `api/_lib/pod-order.ts:93`
- **Sposób odtworzenia:**
  1. Utwórz zamówienie POD dla wzoru kartki z zagranicznego kraju (np. Japonia, język `"ja"`), w którym pole `primary_language_code` lub `language_code` w danych tymczasowych jest puste lub nie zostało zmapowane.
  2. Wywołaj generowanie jednostek produkcyjnych `inventory_units`.
- **Obecne zachowanie:** Kawałek kodu `primary_language_code: String(v.primary_language_code || j.language_code || "pl")` wpisuje `"pl"` do `inventory_units`. Podczas druku generator PDF używa polskiego napisu dziękczynnego dla japońskiej kartki.
- **Oczekiwane zachowanie:** Fallback powinien w pierwszej kolejności korzystać z języka przypisanego do kraju kartki, a nie sztywno z języka polskiego `"pl"`.
- **Sugerowany test regresyjny:** Test w `pod-order.test.ts` sprawdzający tworzenie jednostek `inventory_units` dla wzorów z innych krajów bez zdefiniowanego `primary_language_code`.

---

### [P2-01] Cichy fallback do "pl" przy tworzeniu wzoru kartki dla kraju bez języka podstawowego
- **Priorytet:** P2 (Średni)
- **Plik i linia:** `src/components/admin/AdminCardCreator.tsx:260` (oraz linia 100)
- **Sposób odtworzenia:**
  1. Zaloguj się jako Admin i przejdź do Kreatora Kartki (`AdminCardCreator`).
  2. Wybierz kraj, który posiada szablony językowe, ale żaden nie ma ustawionej flagi `is_primary: true`.
  3. Zapisz nowy wzór kartki.
- **Obecne zachowanie:** Zmienna `languageCode` nie zostaje zaktualizowana ze słownika i przy zapisie wykonuje się `language_code: languageCode || "pl"`, tworząc wzór kartki przypisany do języka polskiego `"pl"`.
- **Oczekiwane zachowanie:** Admin powinien zostać zmuszony do wyboru języka wzoru lub formularz powinien wymusić wybór z szablonów danego kraju.
- **Sugerowany test regresyjny:** Test w `AdminCardCreator.test.tsx` weryfikujący zachowanie formularza po zmianie kraju na taki, który nie posiada domyślnego języka.

---

### [P2-02] Brak normalizacji wielkości liter kodu języka w generatorze PDF do drukarni
- **Priorytet:** P2 (Średni)
- **Plik i linia:** `src/lib/generatePodPrintPdf.tsx:353-362`
- **Sposób odtworzenia:**
  1. Utwórz jednostkę `inventory_unit` z polem `primary_language_code: "PL"` (wielkie litery).
  2. Szablon w `card_language_templates` ma zapisany kod `"pl"` (małe litery).
  3. Wygeneruj plik POD PDF (`generatePodPrintPdf`).
- **Obecne zachowanie:** Odczyt `templateByCountryAndCode.get("${design.country_id}:${unit?.primary_language_code || ""}")` szuka klucza `"ID_KRAJU:PL"`, podczas gdy w mapie znajduje się klucz `"ID_KRAJU:pl"`. Pobranie szablonu zwraca `undefined` i na wygenerowanym pliku PDF brakuje dedykowanego tekstu dziękczynnego.
- **Oczekiwane zachowanie:** Kody języków podczas budowania mapy oraz wyszukiwania w `generatePodPrintPdf` powinny być znormalizowane metodą `.toLowerCase().trim()`.
- **Sugerowany test regresyjny:** Test jednostkowy dla `generatePodPrintPdf` z przekazanym `primary_language_code` w formacie `"PL"` oraz `"En-US"`.

---

### [P2-03] Usunięcie szablonu językowego niszczy warianty na wydrukach PDF dla istniejących zamówień
- **Priorytet:** P2 (Średni)
- **Plik i linia:** `src/integrations/firebase/services/firestoreService.ts:709` oraz `src/components/admin/AdminLanguageTemplates.tsx:191`
- **Sposób odtworzenia:**
  1. Podróżnik kupuje kartkę w języku pomocniczym/rzadkim (np. `"tzm"` - Tamazight). Zamówienie zostaje opłacone, a w `inventory_units` zapisuje się `primary_language_code: "tzm"`.
  2. Administrator usuwa szablon języka `"tzm"` z tabeli `card_language_templates` w panelu admina.
  3. Drukarnia generuje PDF dla wcześniej opłaconego zamówienia.
- **Obecne zachowanie:** Usunięcie szablonu przechodzi bez ostrzeżenia o użyciu w bazie. Podczas generowania PDF szablon dla `"tzm"` nie zostaje znaleziony, przez co na wydruku SRA3 pojawia się domyślny tekst bazowy wzoru zamiast zakupionego języka.
- **Oczekiwane zachowanie:** System powinien blokować usunięcie szablonu językowego używanego w aktywnych wzorach/zamówieniach lub archiwizować go jako nieaktywny (`is_active: false`).
- **Sugerowany test regresyjny:** Test sprawdzający walidację usuwania szablonu językowego w `firestoreService.deleteLanguageTemplate`.

---

## Podsumowanie Weryfikacji Technicznej
- `npm run typecheck`: **SUKCES** (0 błędów)
- `npm test`: **SUKCES** (70 pasujących testów w 16 plikach)
- `npm run lint`: **SUKCES** (0 błędów, 12 ostrzeżeń lintera UI)
