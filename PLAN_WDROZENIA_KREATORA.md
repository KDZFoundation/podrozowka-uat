# Plan Wdrożenia Kreatora Wzorów Kartek (Podróżówka)

## 1. Cel i Rola Kreatora Wzorów
Kreator Wzorów (`AdminCardCreator.tsx`) służy do projektowania i standaryzacji unikalnych wzorów pocztówek w systemie **Podróżówka**. Każdy zaprojektowany wzór spełnia rygorystyczne wymagania druku offsetowego i cyfrowego w formule **Print On Demand (POD)**, umożliwiając automatyczną generację plików PDF gotowych dla drukarni.

---

## 2. Kluczowe Elementy i Funkcjonalności Kreatora

### A. Konfiguracja Podstawowa i Językowa
- **Wybór Kraju i Języka**: Przypisanie wzoru do konkretnego państwa (np. Polska, Włochy, Japonia) oraz szablonu językowego podziękowań.
- **Słownik Tłumaczeń**: Możliwość wyboru predefiniowanych zwrotów podziękowań w języku rodzimym danego kraju.
- **Wariant Wzoru**: Numerowanie wersji (`V01`, `V02`, `V03`...) oraz tworzenie edycji specjalnych lub kolekcjonerskich.

### B. Projektowanie Przodu Pocztówki (Front)
- **Kadr Zdjęcia Głównego**:
  - Przesyłanie fotografii w wysokiej rozdzielczości.
  - Wyznaczanie punktu skupienia obrazu (osie X/Y) do idealnego kadrowania.
- **Pionowa Stopka Autorska**:
  - Automatyczne formatowanie podpisu praw autorskich (np. `(C) Autor zdjęcia` lub `@pseudonim`) umieszczanego pionowo po prawej stronie zdjęcia.
- **Dolny Pas Drukarski i Postacie**:
  - **Lewy Hiker (Szkic)**: Wektorowa postać wędrowca w wersji szkicowej.
  - **Napis Główny**: Centralnie umieszczona treść podziękowania (np. *PODZIĘKOWANIA*, *THANK YOU*, *GRAZIE*).
  - **Prawy Hiker (Kolor)**: Wektorowa postać wędrowca z zielonym plecakiem i brązowym kapeluszem.
  - **Linia Przerywana Cięcia**: Zaznaczenie dolnej krawędzi karty.

### C. Projektowanie Tyłu Pocztówki (Odwrócona Pocztówka / Back)
- **Nagłówek i Znaczek**:
  - Logotyp *"Podróżówka - odwrócona pocztówka"*.
  - Ramka na znaczek z motywem chmur i zielonych wzgórz.
- **Mapa Europy i Szlak**:
  - Wektorowy obrys Europy z podświetloną Polską w barwach narodowych.
  - Przerywana linia szlaku z postacią wędrowca w drodze.
- **Linie Adresowe**:
  - 4 poziome linie na dane adresowe odbiorcy.
- **Sekcja QR i Etykieta**:
  - Etykieta instrukcji (domyślnie *"ZESKANUJ"*).
  - Rezerwacja pola na dynamiczny kod QR przypisywany indywidualnie do każdego zamówienia.

### D. Specyfikacja Techniczna i Znaczniki Drukarskie (Crop Marks)
- **Wymiary Proporcji**: Standard kartki pocztowej 1.42 : 1 (A6 / 148 x 105 mm).
- **Spady i Znaczniki Cięcia**: Zewnętrzne narożne oraz centralne linie cięcia dla drukarni.
- **Profil Kolorów**: Przygotowanie pod CMYK i rozdzielczość 300 DPI.

---

## 3. Schemat Przejścia: Kreator -> Produkt -> Zamówienie POD

1. **Etap 1: Utworzenie Wzoru w Kreatorze**
   - Admin wybiera kraj, wgrywa zdjęcie, ustala podpis autorski i treść podziękowań.
   - Podgląd na żywo przodu i tyłu pocztówki.
   - Zapisanie wzoru w bazie danych (`card_designs`).

2. **Etap 2: Publikacja w Katalogu Produktów**
   - Wzór zostaje automatycznie połączony z produktem w sklepie (`products`).
   - Admin ustala cenę sprzedaży (PLN) oraz aktywuje widoczność w sklepie.

3. **Etap 3: Zamówienie przez Podróżnika**
   - Podróżnik wybiera pocztówkę w sklepie i opłaca zamówienie.
   - System generuje unikalne kody QR przypisane do zakupionych sztuk.

4. **Etap 4: Generowanie PDF i Wysyłka do Drukarni (POD)**
   - W sekcji *Zamówienia* w panelu admina wyzwalana jest generacja pliku PDF (zawierającego szablon przodu i tyłu z unikalnym kodem QR).
   - Zlecenie zostaje przekazane e-mailem/API do drukarni ze zmianą statusu na `W przygotowaniu (API Drukarnia)`.

---

## 4. Harmonogram Wdrożenia i Rozwoju Kreatora

| Krok | Zadanie | Status |
| :--- | :--- | :--- |
| **1** | Dostosowanie podglądu Front/Back w 100% do szablonów drukarskich | **Zrealizowane** |
| **2** | Obsługa znaczników cięcia (*Crop Marks*) i podgląd dwustronny | **Zrealizowane** |
| **3** | Sklonowanie gotowych wzorów do katalogu produktów z cenami | **Zrealizowane** |
| **4** | Generowanie PDF z kodami QR i integracja statusów z Drukarnią (POD) | **Zrealizowane** |
| **5** | Podpięcie produkcyjnego adresu e-mail / klucza API Drukarni | *Oczekuje na dane* |
