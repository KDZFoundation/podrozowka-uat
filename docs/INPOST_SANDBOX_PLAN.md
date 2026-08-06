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
1. **Tworzenie przesyłki (`create-inpost-shipment`)**:
   - Przygotowany endpoint w `supabase/functions/create-inpost-shipment/index.ts` przyjmujący `order_id` oraz gabaryt (`size`: A, B, C) i zgłaszający paczkę na adres `https://sandbox-api-shipx-pl.easypack24.net/v1`.
2. **Pobieranie etykiet PDF (`get-inpost-label`)**:
   - Dedykowany endpoint lub funkcja serwująca gotowy plik PDF z etykietą do druku z ShipX API.
3. **Webhook statusów przesyłek (`inpost-shipx-webhook`)**:
   - Endpoint odbierający zdarzenie `shipment_status_changed` z InPost ShipX.
   - Rejestracja adresu webhooka (np. `https://<project-ref>.supabase.co/functions/v1/inpost-shipx-webhook`) w panelu Manager Paczek Sandbox (**Ustawienia organizacji -> Nowy adres webhook**).

### Krok 3: Panel Administratora (`AdminShipments.tsx`)
1. Dedykowany moduł zgłaszania przesyłki w InPost z wyborem gabarytu (A/B/C).
2. Przycisk "Zgłoś w InPost ShipX" oraz "Pobierz etykietę".
3. Wyświetlanie zwróconego numeru śledzenia i ID przesyłki InPost.

---
*Dokumentacja została zaktualizowana i uwzględnia rozdzielenie kont Sandbox, konfigurację sekretów Supabase Edge Functions oraz dedykowany Webhook.*

