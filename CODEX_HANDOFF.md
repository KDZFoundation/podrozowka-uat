# Codex Handoff & Project Status (Podróżówka UAT)

Data sporządzenia: **2026-08-23 21:00 CEST**  
Autor: **Antigravity AI (Pair Programming Assistant)**  
Środowisko: `C:\Users\dariu\Documents\Playground 3\tmp\podrozowka-uat` (Branch: `codex/generate-pod-qr-after-payment`)

---

## 1. Kontekst Przerwania Pracy przez Codex
W dniu 2026-08-23 o godz. 20:44 Codex otrzymał pytanie:
> *„czy zapoznałeś się z całą strukturą https://supabase.com/dashboard/project/nqqephusxnxzzkfulfae/database/schemas?”*

Codex rozpoczął inspekcję, po czym sesja została przerwana z powodu limitu zapytań (*Usage Limit Exceeded*).  
Audyt żywej bazy został w pełni przeprowadzony, a jego wyniki zapisano w projekcie w pliku `SUPABASE_SCHEMA_AUDIT.json` oraz w `CODEX_HANDOFF.md`.

---

## 2. Audyt Żywego Schematu Supabase (`nqqephusxnxzzkfulfae`)

W odpytaniu instancji Supabase REST API zidentyfikowano **24 tabele i widoki**. Poniżej zestawienie i mapowanie na kolekcje Firebase Firestore:

### A. Główne Tabele Zmapowane w Firestore
| Tabela Supabase | Kolekcja Firestore | Pola kluczowe / Różnice | Status |
| :--- | :--- | :--- | :--- |
| `countries` | `countries` | `id` (ISO2), `name_pl`, `slug`, `flag_url`, `active` | ✅ Pełna zgodność |
| `categories` | `categories` | `id`, `slug`, `name_pl`, `icon_url`, `product_code_prefix` | ✅ Pełna zgodność |
| `authors` / `author_profiles` | `authors` | `id`, `display_name`, `bio`, `avatar_url`, `social_handle` | ✅ Zintegrowane |
| `card_designs` | `card_designs` | `title`, `country_id`, `category_id`, `price_grosze`, `currency`, `language_code`, `view_no`, `photo_author`, `crop_settings`, `product_code`, `firmino_article_id`, `active` | ✅ Pełna zgodność |
| `card_design_images` | Pod-tablica `images[]` w `card_designs` | `url`, `sort_order` | ✅ Zagnieżdżone |
| `card_language_templates` | `card_language_templates` | `country_id`, `language_code`, `front_thank_you_text`, `back_qr_label` | ✅ Pełna zgodność |
| `profiles` / `user_roles` | `users` | `email`, `display_name`, `role`, `gamification_points`, `current_tier` | ✅ Zintegrowane z Firebase Auth |
| `orders` + `order_items` | `orders` | W Firestore pozycje są osadzone w tablicy `items[]` w dokumencie zamówienia (`FirestoreOrder`) | ✅ Zintegrowane |
| `inventory_units` | `inventory_units` | `card_design_id`, `internal_inventory_code`, `public_claim_token`, `status`, `order_id`, `traveler_user_id` | ✅ Obsługiwane przez `inventoryService` |
| `recipient_registrations` | `recipient_registrations` | `inventory_unit_id`, `recipient_name`, `recipient_country`, `message`, `coordinates` | ✅ Zgodne |

### B. Tabele Specyficzne / Magazynowe / Drukarskie (Do ewentualnej dalszej synchronizacji)
* `stock_batches`, `stock_production_orders`, `inventory_locations`, `inventory_movements`, `inventory_unit_events` – tabele magazynowe i historia ruchów w modelu hybrydowym/POD.
* `qr_print_jobs`, `qr_print_job_items`, `pod_production_batch_orders` – zlecenia druku wsadowego POD.
* `payment_settings`, `shipping_settings`, `feature_flags` – ustawienia bramek (HotPay/P24) i kurierów (InPost, Orlen, Pocztex).
* `gamification_config`, `gamification_tiers`, `platform_stats`, `notifications` – statystyki i grywalizacja.

---

## 3. Stan Kodu i Testów Lokalnych

* **Testy jednostkowe i integracyjne:** `51 / 51 passed` (`npm test`).
* **Build produkcyjny:** `npm run build` zakończony sukcesem (`built in 9.65s`, brak błędów kompilacji TypeScript/Vite).

---

## 4. Ostatnie Wdrożone Poprawki

1. **Poprawka nr 4 – Generowanie jednostek QR po zakupie:**
   * Po przejściu płatności (HotPay webhook / status `PAID`) następuje automatyczne wygenerowanie rekordów w `inventory_units` dla każdej zakupionej sztuki.
2. **Szczegóły Zamówienia w Panelu Podróżnika (`MyOrders.tsx`):**
   * Wyświetlanie 2 warstw: pozycji zbiorczej (np. *„Podróżówka Włochy — 10 szt.”*) oraz listy fizycznych jednostek z kodami jednostkowymi (`PDZ-...`), claim codes i statusami QR.
3. **Formularze dostawy:**
   * Wdrożenie komponentów wyboru punktów odbioru (Pocztex, InPost Geowidget).

---

## 5. Rekomendowane Dalsze Kroki dla Codexa

1. **Weryfikacja widoku zamówień przez Użytkownika:**
   * Potwierdzenie działania generatora QR na nowym zamówieniu testowym (oczekiwanie na potwierdzenie poprawki nr 4, aktualny licznik: **2/5**).
2. **Kolejne punkty z listy poprawek (zadania 3, 4, 5):**
   * Sprawdzenie integracji manifestów wysyłkowych PDF / zleceń do drukarni POD.
   * Kontynuacja ewentualnego mapowania tabel specyficznych z Supabase do Firestore (jeśli wymagane).
