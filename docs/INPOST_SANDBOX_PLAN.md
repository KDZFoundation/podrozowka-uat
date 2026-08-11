# Plan wdrożenia środowiska testowego InPost (Geowidget & API ShipX Sandbox)

## 1. Stan obecny (Co mamy w projekcie)
- **InPost Geowidget**: Komponent `src/components/checkout/InpostGeowidget.tsx` pobiera SDK Geowidget z `https://geowidget.easypack24.net` przy użyciu tokenu `VITE_INPOST_GEOWIDGET_TOKEN`.
- **Wybór Paczkomatu w Checkout**: Strony `Checkout.tsx` oraz `MyOrders.tsx` umożliwiają wybór punktu odbioru (Paczkomat) i zapisują dane punktu (`pickup_point_name`, `pickup_point_address`, `pickup_point_city`).
- **Baza Danych**: Tabela `orders` przechowuje metadane przesyłki (`shipping_method = 'inpost'`, dane punktu odbioru, koszt dostawy), a tabela `shipments` wspiera kolumny InPost (`inpost_shipment_id`, `label_url`, `size`).
- **Brakujące elementy**:
  1. Wygenerowane dedykowane klucze testowe w panelu **Manager Paczek Sandbox** (`sandbox-manager.paczkomaty.pl`).
  2. Konfiguracja sekretów Supabase (`INPOST_SHIPX_ORGANIZATION_ID`, `INPOST_SHIPX_TOKEN`, `INPOST_SHIPX_ENV`).
  3. Dedykowany Webhook dla zdarzeń ShipX w czasie rzeczywistym.

---

## 2. Zakres integracji (Rozdzielenie ShipX od InPost Pay)
- **Wykonywany zakres (InPost ShipX)**: Wybór Paczkomatu przez Geowidget w procesie zamówienia, automatyczna i ręczna rejestracja przesyłek z poziomu panelu administratora, generowanie/pobieranie etykiet przesyłek oraz automatyczna zmiana statusów paczek.
- **Wydzielony zakres (InPost Pay)**: Testowanie mobilnego koszyka InPost Pay i kody testowe BLIK (np. `777111`, `500500`) to osobny produkt płatniczy i stanowią odrębne zadanie poza zakresem samej logistyki przesyłek.

---

## 3. Szczegółowy Plan Wdrożenia

### Krok 0: Rejestracja w InPost Manager Paczek Sandbox (Wymagane działanie w panelu InPost)
1. Zalogowanie/utworzenie konta na dedykowanym portalu testowym: **`https://sandbox-manager.paczkomaty.pl/`** *(Konto produkcyjne z manager.paczkomaty.pl nie działa w środowisku Sandbox!)*.
2. Przejście do zakładki **Moje Konto -> Dane / API**:
   - Skopiowanie **ID organizacji** (`INPOST_SHIPX_ORGANIZATION_ID`).
   - Wygenerowanie tokena **API ShipX** (`INPOST_SHIPX_TOKEN`).
   - Wygenerowanie tokena dla **Geowidgetu** (`VITE_INPOST_GEOWIDGET_TOKEN`) z wpisanymi dozwolonymi domenami (np. `*.run.app`, `localhost`).

### Krok 1: Konfiguracja Sekretów (Supabase vs Frontend)
1. **Zmienne frontendowe (Build-time)**:
   - `VITE_INPOST_GEOWIDGET_TOKEN` w pliku `.env.example` oraz w zmiennych środowiskowych aplikacji.
2. **Sekrety backendowe (Supabase Edge Functions)**:
   - Ustawienie sekretów na projekcie Supabase za pomocą CLI:
     ```bash
     supabase secrets set INPOST_SHIPX_ORGANIZATION_ID="twój_id_organizacji"
     supabase secrets set INPOST_SHIPX_TOKEN="twój_token_sandbox"
     supabase secrets set INPOST_SHIPX_ENV="sandbox"
     ```
   - Weryfikacja ustawionych sekretów poleceniem `supabase secrets list`.

### Krok 2: Edge Functions i Webhook w czasie rzeczywistym
1. **Tworzenie przesyłki (`create-inpost-shipment`) — gotowe w kodzie**:
   - Dostępne wyłącznie administratorowi i wyłącznie po opłaceniu zamówienia.
   - Zapisuje lokalnie identyfikator ShipX oraz stan `created`; nie tworzy sztucznego numeru śledzenia.
2. **Zakup oferty (`buy-inpost-shipment`) — gotowe w kodzie**:
   - Administrator kupuje ofertę dopiero po jej przygotowaniu przez ShipX.
   - Jest to proces asynchroniczny: numer śledzenia i możliwość pobrania etykiety pojawiają się po zdarzeniu `shipment_confirmed`.
3. **Pobieranie etykiet PDF (`get-inpost-label`) — gotowe w kodzie**:
   - Panel administratora pobiera etykietę A6 bezpośrednio z ShipX; plik nie jest publicznie zapisywany w bazie.
4. **Webhook statusów przesyłek (`inpost-shipx-webhook`) — gotowe w kodzie**:
   - Adres dla DEV: `https://xiqhaiyieisgemqopxfw.supabase.co/functions/v1/inpost-shipx-webhook`.
   - Rejestracja adresu webhooka w Managerze Paczek Sandbox: **Moje konto → API → Ustawienia organizacji → adres webhook**.
   - Webhook weryfikuje ID organizacji i aktualizuje lokalny numer śledzenia oraz status przesyłki.

### Krok 3: Panel Administratora (`AdminShipments.tsx`)
1. Dedykowany moduł tworzenia przesyłki w InPost z wyborem gabarytu (A/B/C) — gotowy.
2. Oddzielne, czytelne akcje: **Utwórz w InPost ShipX → Kup przesyłkę → Pobierz etykietę PDF** — gotowe.
3. Wyświetlanie identyfikatora, stanu ShipX i zwróconego numeru śledzenia — gotowe.

## 4. Konfiguracja konieczna przed pierwszym testem

1. W Managerze Paczek Sandbox uzupełnij Dane oraz Dane do faktury, wygeneruj **ID organizacji**, token **ShipX** oraz token **Geowidget**. Instrukcja PDF w katalogu `InPost/` potwierdza te kroki.
2. Ustaw backendowe sekrety w projekcie Supabase DEV (nigdy w Vercel ani w kodzie):
   ```powershell
   supabase secrets set INPOST_SHIPX_ORGANIZATION_ID="..." INPOST_SHIPX_TOKEN="..." INPOST_SHIPX_ENV="sandbox" --project-ref xiqhaiyieisgemqopxfw
   ```
3. Dodaj `VITE_INPOST_GEOWIDGET_TOKEN` tylko do zmiennych środowiskowych Vercel DEV / lokalnego `.env`; token zawierać musi domenę `127.0.0.1` oraz domenę docelowego wdrożenia.
4. Wdróż migrację i funkcje DEV. Po wdrożeniu dodaj adres webhooka z kroku 2.4.
5. Do testu sandboxa doładuj wirtualne środki w Managerze Paczek. ShipX potwierdza zakup asynchronicznie, dlatego etykiety nie pobiera się bezpośrednio po kliknięciu „Kup”.

---
*Dokumentacja została zaktualizowana i uwzględnia rozdzielenie kont Sandbox, konfigurację sekretów Supabase Edge Functions oraz dedykowany Webhook.*

