# Plan Migracji z Supabase do Firebase / Firestore dla Projektu Podróżówka

Dokument zawiera kompleksowy plan architektoniczny i wdrożeniowy migracji projektu **Podróżówka** z bazy i usług **Supabase** (`https://nqqephusxnxzzkfulfae.supabase.co`) do **Google Cloud Firebase / Firestore**.

---

## 1. Analiza stanu obecnego (Inwentaryzacja Supabase)

Projekt Podróżówka w Supabase składa się z 4 głównych warstw:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           STAN OBECNY (SUPABASE)                            │
├──────────────────────┬──────────────────────┬───────────────────────────────┤
│ PostgreSQL & RLS     │ Supabase Auth & RLS  │ Edge Functions (Deno)         │
│ - 23 Tabele          │ - auth.users         │ - 20 funkcji (płatności,      │
│ - 3 Widoki           │ - Role (user_roles)  │   logistyka InPost/Orlen,     │
│ - 15+ Funkcji SQL    │                      │   fiskalizacja, PDF/QR,       │
│ - Triggery           │ Storage Buckets      │   rejestracja kartek)         │
│                      │ - Zdjęcia kartek,    │                               │
│                      │   umowy, kody QR     │ Webhooki (HotPay, P24, ShipX) │
└──────────────────────┴──────────────────────┴───────────────────────────────┘
```

### Inwentaryzacja danych i procedur:
* **Katalog & Autorzy**: `countries`, `categories`, `authors`, `card_designs`, `card_design_images`, `card_language_templates`.
* **E-commerce & Logistyka**: `orders`, `order_items`, `shipments`, `payment_settings`.
* **Magazyn & Wdrożenie POD / Stock**: `inventory_units`, `inventory_locations`, `inventory_movements`, `inventory_unit_events`, `stock_batches`, `stock_production_orders`, `qr_print_jobs`, `qr_print_job_items`.
* **Użytkownicy, Grywalizacja & Rejestracje**: `profiles`, `user_roles`, `recipient_registrations`, `gamification_config`, `gamification_tiers`, `platform_stats`, `notifications`.
* **Procedury SQL (RPC)**: m.in. `create_order`, `reserve_inventory_for_order`, `receive_stock_production_order`, `prepare_stock_print_batch`, `register_recipient`, `recalculate_user_gamification`.
* **20 Edge Functions**: Webhooki płatności (`hotpay-webhook`, `p24-webhook`), logistyka (`inpost-shipx-webhook`, `buy-inpost-shipment`, `get-inpost-label`), fakturowanie (`issue-fiscal-document`, `sync-firmino-article`), generatory QR/PDF oraz rejestracja kartek (`register-postcard`).

---

## 2. Architektura docelowa NoSQL w Cloud Firestore

W relacyjnej bazie SQL występują złączenia (JOINs) i klucze obce. W Firestore przechodzimy na hybrydowy model dokumentowo-kolekcyjny:

```
firestore-root/
├── countries/{countryId}                   # Słownik krajów + config bramek płatności
├── categories/{categoryId}                 # Kategorie kartek
├── authors/{authorId}                      # Profile i umowy autorów
├── card_designs/{designId}                 # Wzory kartek (zagnieżdżona tablica `images` lub subkolekcja)
│   └── templates/{templateId}              # Szablony językowe dla danego kraju/wzoru
├── users/{userId}                          # Profile użytkowników
│   └── notifications/{notificationId}      # Powiadomienia użytkownika (subkolekcja)
├── orders/{orderId}                        # Zamówienia (zagnieżdżona tablica `items` + dane rozliczeniowe)
├── shipments/{shipmentId}                  # Przesyłki kurierskie/paczkomatowe
├── inventory_units/{unitId}                # Jednostki magazynowe (unikalne kody QR i tokeny)
│   └── events/{eventId}                    # Historia zdarzeń jednostki (subkolekcja)
├── stock_batches/{batchId}                 # Partie magazynowe
├── stock_production_orders/{orderId}       # Zlecenia produkcyjne drukarni
├── recipient_registrations/{regId}         # Rejestracje kartek przez obdarowanych
├── qr_print_jobs/{jobId}                   # Zadania druku kodów QR
│   └── items/{itemId}                      # Pozycje arkusza QR
└── config/                                 # Singletony konfiguracyjne
    ├── payment                             # Ustawienia P24 / HotPay
    ├── inpost                              # Dane dostępowe InPost ShipX / Sandbox
    ├── orlen                               # Dane dostępowe Orlen Paczka
    ├── gamification                        # Punkty, wagi, progi rang
    └── platform_stats                      # Globalne zagregowane liczniki
```

### Kluczowe decyzje modelowania:
1. **Płaska kolekcja `inventory_units`**: Zachowana na poziomie głównym (root), aby umożliwić szybkie wyszukiwanie jednostki po haszu tokena (`public_claim_token_hash`) oraz unikalnym kodzie (`internal_inventory_code`).
2. **Denormalizacja `orders.items`**: Pozycje zamówienia osadzone bezpośrednio w dokumencie zamówienia (zmniejsza liczbę odczytów i gwarantuje spójność cen z momentu zakupu).
3. **Role użytkowników**: Migracja z tabeli `user_roles` do **Firebase Custom User Claims** (`{ admin: true, traveler: true }`), co pozwala na weryfikację uprawnień w Security Rules bez dodatkowych odczytów bazy.

---

## 3. Fazy realizacji migracji

```
┌────────────────────────────────────────────────────────────────────────────┐
│                             HARMONOGRAM FAZ                                │
├─────────────┬─────────────┬─────────────┬─────────────┬────────────────────┤
│   FAZA 1    │   FAZA 2    │   FAZA 3    │   FAZA 4    │     FAZA 5 & 6     │
│ Inicjaliz.  │ Backend &   │ Frontend &  │ ETL Dry-Run │ Cutover &          │
│ Firebase    │ Functions   │ SDK Swap    │ UAT Testy   │ Przełączenie Prod  │
└─────────────┴─────────────┴─────────────┴─────────────┴────────────────────┘
```

### Faza 1: Inicjalizacja i konfiguracja Firebase
1. Utworzenie projektu w Firebase Console (lub powiązanie z projektem GCP).
2. Włączenie usług:
   - **Cloud Firestore** (w regionie `europe-west1` lub `europe-west3`).
   - **Firebase Authentication** (Email/Password, ew. Google OAuth).
   - **Cloud Storage for Firebase** (region europejski dla plików graficznych i PDF).
   - **Cloud Functions for Firebase (Node.js 20, Gen 2)**.
3. Przygotowanie konfiguracji w repozytorium:
   - `firebase.json` (konfiguracja Firestore, Storage, Functions, Emulators).
   - `firestore.rules` (odpowiednik PostgreSQL RLS).
   - `storage.rules` (reguły dostępu do plików).
   - `firestore.indexes.json` (indeksy złożone dla zapytań e-commerce i magazynu).

---

### Faza 2: Przepisanie logiki biznesowej i Edge Functions $\to$ Cloud Functions

Wszystkie procedury SQL (RPC) oraz funkcje Deno Supabase zostaną przeniesione do Cloud Functions (TypeScript / Node.js 20):

| Logika Supabase (Stan obecny) | Implementacja docelowa w Firebase |
| :--- | :--- |
| **`create_order` + `reserve_inventory_for_order`** (Procedury SQL) | `functions.https.onCall(createOrder)` z **`db.runTransaction()`** – atomowa blokada stanów magazynowych w Firestore i generowanie numeru zamówienia. |
| **`hotpay-webhook`, `p24-webhook`** (Edge Functions) | `functions.https.onRequest(hotpayWebhook)` – obsługa callbacków płatności z walidacją podpisu i aktualizacją dokumentu zamówienia w transakcji. |
| **`inpost-shipx-webhook`** (Edge Function) | `functions.https.onRequest(inpostWebhook)` – aktualizacja statusów przesyłek i automatyczna zmiana statusu jednostek magazynowych. |
| **`register-postcard` + `register_recipient`** | `functions.https.onCall(registerPostcard)` – weryfikacja tokena QR, przypisanie współrzędnych i zarejestrowanie obdarowanego. |
| **`recalculate_user_gamification`** (Triggery SQL) | `functions.firestore.onDocumentCreated('recipient_registrations/{id}')` – reaktywny trigger przeliczający punkty podróżnika i aktualizujący profil. |
| **`generate-qr-pdf`, `fiscal-document-pdf`** | `functions.https.onCall` z bibliotekami `pdf-lib` / `qrcode` zapisujące gotowe pliki bezpośrednio do Cloud Storage. |

---

### Faza 3: Migracja użytkowników i bazy danych (Skrypt ETL)

Należy przygotować dedykowany skrypt migracyjny (np. `scripts/migrate-supabase-to-firebase.ts`):

```typescript
// Szkic architektury skryptu ETL:
// 1. Inicjalizacja klienta Supabase (service_role) i Firebase Admin SDK
// 2. Eksport użytkowników z auth.users -> auth().importUsers() (zachowanie UID)
// 3. Transformacja tabel słownikowych -> batch writes do Firestore
// 4. Transformacja zamówień, kart i stanów magazynowych
// 5. Migracja plików z Supabase Storage do Firebase Storage
```

1. **Użytkownicy (Auth)**:
   - Eksport `auth.users` z Supabase (zahashowane hasła, emaile, daty rejestracji).
   - Import do Firebase Auth przez `admin.auth().importUsers()` z zachowaniem oryginalnych `uid`.
   - Ustawienie Custom Claims: `admin.auth().setCustomUserClaims(uid, { role: 'admin' })` dla administratorów.
2. **Dane relacyjne $\to$ Dokumenty**:
   - Ekstrakcja danych z tabel Supabase partiami (paged chunks po 500 rekordów).
   - Przekształcenie kluczy obcych na referencje dokumentów lub spłaszczone pola ID.
   - Zapis do Firestore za pomocą `db.batch()`.
3. **Pliki (Storage)**:
   - Kopiowanie bucketów: pobranie binary stream z Supabase Storage i upload do Firebase Storage.
   - Aktualizacja adresów URL w dokumentach wzorów kartek (`image_front_url`).

---

### Faza 4: Bezpieczeństwo i Reguły Firestore (`firestore.rules`)

Przeniesienie polityk RLS z PostgreSQL do reguł Firestore:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isAdmin() {
      return isAuthenticated() && request.auth.token.role == 'admin';
    }
    
    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }

    // Publiczny odczyt katalogu
    match /card_designs/{designId} {
      allow read: if true;
      allow write: if isAdmin();
    }
    
    match /countries/{countryId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    // Profile użytkowników
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow write: if isOwner(userId) || isAdmin();
    }

    // Zamówienia - odczyt tylko dla właściciela lub administratora
    match /orders/{orderId} {
      allow read: if isOwner(resource.data.user_id) || isAdmin();
      allow create: if isAuthenticated();
      allow update, delete: if isAdmin();
    }

    // Magazyn i kody QR - pełna ochrona (modyfikacja tylko przez Cloud Functions / Admin)
    match /inventory_units/{unitId} {
      allow read: if isAuthenticated() && (resource.data.traveler_user_id == request.auth.uid || isAdmin());
      allow write: if isAdmin();
    }
  }
}
```

---

### Faza 5: Refaktoryzacja aplikacji Frontendowej

1. **Wymiana pakietów npm**:
   - Usunięcie: `@supabase/supabase-js`.
   - Instalacja: `firebase` (lub bibliotek pomocniczych `@tanstack/react-query` z Firebase SDK).
2. **Warstwa połączenia (`src/integrations/firebase/`)**:
   - Utworzenie konfiguracji klienta `firebase.ts` (`initializeApp`, `getFirestore`, `getAuth`, `getFunctions`, `getStorage`).
3. **Konteksty i Hooki**:
   - `useAuth.tsx`: Zmiana `supabase.auth.onAuthStateChange` na `onAuthStateChanged(auth, user => ...)`.
   - `CartContext.tsx` & `CheckoutContext.tsx`: Wywołania Cloud Function `createOrder` zamiast procedury RPC `create_order`.
   - Panel Administracyjny (`AdminPanel.tsx`): Pobieranie danych przez Firestore queries (`getDocs`, `onSnapshot`).
   - Komponenty dynamiczne (np. `CommunityLoop.tsx`, `DistributionMap.tsx`): Odczyt z kolekcji `recipient_registrations`.

---

### Faza 6: Plan Przełączenia Produkcyjnego (Cutover Checklist)

```
[ ] 1. Przetestowanie pełnego scenariusza E2E na środowisku testowym (UAT Firebase):
       - Zakup pocztówki (HotPay Sandbox)
       - Odbiór webhooka płatności i alokacja jednostek magazynowych
       - Generowanie zlecenia InPost ShipX
       - Rejestracja kodu QR przez obdarowanego (/r/:qrToken)
       - Naliczanie punktów w profilu podróżnika
[ ] 2. Ustalenie okna serwisowego (np. 1-2 godziny w nocy).
[ ] 3. Włączenie trybu konserwacji w aplikacji (maintenance mode).
[ ] 4. Zatrzymanie lub przekierowanie zewnętrznych webhooków (HotPay, InPost).
[ ] 5. Uruchomienie finalnego skryptu migracji ETL (delta sync: użytkownicy, zamówienia, magazyn).
[ ] 6. Walidacja sum kontrolnych (liczba zamówień, rekordów magazynowych, profili).
[ ] 7. Wdrożenie zaktualizowanej wersji frontendu wskazującej na Firebase.
[ ] 8. Aktualizacja adresów URL webhooków w panelach HotPay, Przelewy24 i InPost na nowe endpointy Cloud Functions.
[ ] 9. Testy dymne na produkcji i wyłączenie trybu konserwacji.
```

---

## 4. Potencjalne ryzyka i strategie mitygacji

1. **Transakcje i Race Conditions w rezerwacji kartek**:
   * *Ryzyko*: Jednoczesny zakup ostatniej sztuki danego wzoru przez dwóch klientów.
   * *Rozwiązanie*: Zastosowanie transakcji Firestore `db.runTransaction()` na dokumencie wzoru lub dedykowanym dokumencie salda magazynowego z atomowym sprawdzaniem licznika.
2. **Hashe haseł użytkowników**:
   * *Ryzyko*: Konieczność resetowania haseł przez użytkowników po migracji.
   * *Rozwiązanie*: Wykorzystanie `admin.auth().importUsers()` z algorytmem `BCRYPT` lub `SCRYPT` (zgodnie z formatem Supabase GoTrue), co pozwala zachować istniejące hasła bez wymuszania ich resetu.
3. **Koszty odczytów Firestore**:
   * *Ryzyko*: Duża liczba odczytów przy renderowaniu mapy i statystyk.
   * *Rozwiązanie*: Wykorzystanie dokumentu-agregatora `config/platform_stats` aktualizowanego inkrementacyjnie przez triggery w tle (zamiast pobierania wszystkich rejestracji).
