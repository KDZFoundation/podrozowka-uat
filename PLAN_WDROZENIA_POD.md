# Plan Wdrożenia i Logika Systemu POD (Print On Demand) — Podróżówka

## 1. Zarys Logiki Systemu w Panelu Admina

### A. Kreator Wzorów (Wzory kartek + Szablony Językowe)
- **Cel**: Tworzenie oraz edycja wzorów pocztówek w podziale na kraje i kategorie.
- **Zgodność z Szablonem Drukarskim**:
  - **Przód (Front)**: Duża ramka na zdjęcie z podanym autorem `(C)`, dolny pas z dwoma charakterystycznymi ludzikami (lewy szkicowy, prawy kolorowy z zielonym plecakiem) i tekstem podziękowania w danym języku, oddzielony dolną linią przerywaną.
  - **Tył (Back)**: Tytuł *"Podróżówka - odwrócona pocztówka"*, wektorowa mapa Europy z zaznaczoną w barwach narodowych Polską i ścieżką podróżnika, 4 linie adresowe, znaczek pocztowy oraz dedykowany obszar na kod QR z etykietą *"ZESKANUJ"*.

### B. Produkty (Katalog Towarów)
- Przypisanie gotowych wzorów z kreatora do sklepu publicznego.
- Ustalanie cen detalicznych (PLN) oraz włączanie/wyłączanie widoczności kartki w sklepie dla podróżników.

### C. Magazyn (Print On Demand)
- Brak wymogu trzymania i zamrażania fizycznego stoku kartek na magazynie.
- Wartości magazynowe generowane są dynamicznie pod zlecenia druku w formule POD.

### D. Zamówienia (Integracja z Drukarnią)
- Podgląd i zarządzenie pełnym cyklem życia zamówienia:
  1. **Oczekuje na płatność** (`pending`) — podróżnik złożył zamówienie w sklepie.
  2. **Opłacone** (`paid`) — płatność potwierdzona, zamówienie trafia do kolejki POD.
  3. **W przygotowaniu (API Drukarnia)** (`processing_pod`) — automatyczne/ręczne wygenerowanie pliku PDF ze wzorem i unikalnymi kodami QR oraz wysyłka zlecenia do drukarni (E-mail / API REST).
  4. **Zrealizowane (API Drukarnia)** (`fulfilled`) — drukarnia wydrukowała, spakowała i wysłała pocztówki do klienta.

---

## 2. Dedykowany Format Druku (PDF POD)

- Generowanie gotowych do druku plików PDF ze znacznikami cięcia (*Crop Marks*) dla przodu i tyłu pocztówki.
- Automatyczna dynamiczna podmiana unikalnego kodu QR pod podziękowanie na odwrocie każdej zamówionej kartki.

---

## 3. Dalsze Krok Wdrożeniowe

1. **Konfiguracja Adresu E-mail / API Drukarni**:
   - Wprowadzenie docelowego adresu e-mail drukarni lub danych uwierzytelniających API w panelu administracyjnym.
2. **Automatyzacja Wyzwalacza (Webhook Płatności)**:
   - Podpięcie automatycznej wysyłki zlecenia druku natychmiast po udanej płatności online.
3. **Statusy Zwrotne**:
   - Odbieranie powiadomień API z drukarni po nadaniu paczki (z numerem listu przewozowego).
