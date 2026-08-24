# Codex Handoff & Project Status (Podróżówka UAT)

Data sporządzenia: **2026-08-23 21:24 CEST**
Autor: **Antigravity AI (Pair Programming Assistant)**
Środowisko: `C:\Users\dariu\Documents\Playground 3\tmp\podrozowka-uat` (Branch: `main`)

---

## 1. Zrealizowane Prace w Bieżącej Sesji

### A. Weryfikacja i Scalenie Zamówień (PR #20)
* Dwuwarstwowy widok zamówień w [MyOrders.tsx](file:///C:/Users/dariu/Documents/Playground%203/tmp/podrozowka-uat/src/components/dashboard/MyOrders.tsx) (pozycja handlowa + rozbicie na fizyczne kody QR i claim codes).
* Kanoniczny cykl zamówień w Firestore, deduplikacja, obsługa statusów płatności HotPay.
* Formularze wyboru punktów dostawy (Pocztex Point i InPost GeoWidget).
* [PR #20](https://github.com/KDZFoundation/podrozowka-uat/pull/20) został scalony do `main` i wdrożony na Vercel/Firebase Hosting.

### B. Wdrożenie Rejestracji Obdarowanego po QR (`/r/:token`) w Firestore
* **[NEW] `api/register-postcard.ts` & `server.ts`:**
  * Endpoint `GET /api/register-postcard?token=...`: wyszukiwanie w Firestore `inventory_units` po hash tokena / tokenie / claim code, odczyt wzoru kartki, kraju oraz profilu podróżnika.
  * Endpoint `POST /api/register-postcard`: walidacja i atomowa rejestracja w `recipient_registrations`, zmiana statusu `inventory_units` na `registered`, automatyczne naliczenie punktów podróżnikowi (+50 pkt za relację), przeliczenie dystansu geograficznego w kilometrach (Haversine z Polski) i aktualizacja rangi.
* **[MOD] [RegisterPostcard.tsx](file:///C:/Users/dariu/Documents/Playground%203/tmp/podrozowka-uat/src/pages/RegisterPostcard.tsx):**
  * Zaktualizowano formularz rejestracji obdarowanego do komunikacji z nowym API Firestore z fallbackiem do Supabase.

### C. Podpięcie Grywalizacji i Rang Podróżnika do Firestore
* **Naliczanie punktów za zakup:**
  * W [pod-order.ts](file:///C:/Users/dariu/Documents/Playground%203/tmp/podrozowka-uat/api/_lib/pod-order.ts) oraz [server.ts](file:///C:/Users/dariu/Documents/Playground%203/tmp/podrozowka-uat/server.ts) dodano naliczanie **+10 pkt** za każdą zakupioną Podróżówkę oraz aktualizację licznika `postcards_purchased` i automatyczną kalkulację rang (*Zwiadowca* $\rightarrow$ *Odkrywca* $\rightarrow$ *Ambasador* $\rightarrow$ *Misjonarz Kultury* $\rightarrow$ *Legenda Podróżówki*).
* **Komponenty Dashboardu i Społeczności:**
  * [RankCard.tsx](file:///C:/Users/dariu/Documents/Playground%203/tmp/podrozowka-uat/src/components/dashboard/RankCard.tsx) – odczyt punktów, rang, zasięgu krajów i relacji z Firestore via `firestoreService.getTravelerStats`.
  * [UserStats.tsx](file:///C:/Users/dariu/Documents/Playground%203/tmp/podrozowka-uat/src/components/dashboard/UserStats.tsx) – dynamiczne statystyki kartek i relacji per kraj z Firestore.
  * [UserRanking.tsx](file:///C:/Users/dariu/Documents/Playground%203/tmp/podrozowka-uat/src/components/UserRanking.tsx) – pobieranie globalnego rankingu podróżników z Firestore.
  * [CulturalMissions.tsx](file:///C:/Users/dariu/Documents/Playground%203/tmp/podrozowka-uat/src/components/dashboard/CulturalMissions.tsx) & [TravelerJournal.tsx](file:///C:/Users/dariu/Documents/Playground%203/tmp/podrozowka-uat/src/components/dashboard/TravelerJournal.tsx) – oś czasu zdarzeń podróżnika oparta o Firestore.

---

## 2. Stan Testów i Builda

* **Testy jednostkowe i integracyjne:** `54 / 54 passed` (`npm test`).
  * `register-postcard.test.ts` (3 testy odległości, rang i tokenów).
  * `checkout.test.ts` (19 testów).
  * `cart.test.tsx` (19 testów).
  * `checkout-context.test.tsx` (4 testy).
  * `firestore-orders.test.ts`, `firestore-api-paths.test.ts`, `hotpay-webhook.test.ts`, `routing.test.tsx`, `shipping-method-picker.test.tsx`.
* **Build produkcyjny:** `npm run build` kompiluje się czysto (`built in 8.88s`).

---

## 3. Schematy Bazy Danych
* Audyt żywego schematu Supabase znajduje się w [SUPABASE_SCHEMA_AUDIT.json](file:///C:/Users/dariu/Documents/Playground%203/tmp/podrozowka-uat/SUPABASE_SCHEMA_AUDIT.json).
* Wszystkie kluczowe kolekcje (`orders`, `inventory_units`, `recipient_registrations`, `users`, `card_designs`, `countries`, `categories`) działają spójnie na Firebase Firestore.
