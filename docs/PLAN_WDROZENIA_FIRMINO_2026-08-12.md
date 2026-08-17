# Plan wdrożenia Firmino — dokumenty sprzedaży

**Data:** 12.08.2026
**Status:** plan zatwierdzony biznesowo; bez zmian wdrożeniowych

## 1. Cel

Zastąpić integrację Merit / 360 Księgowość integracją **Firmino** dla dokumentów
sprzedaży Podróżówki. Po skutecznie opłaconym zamówieniu system ma wystawić i
wysłać klientowi **rachunek zwolniony z VAT**, a w panelu oraz na stronie
potwierdzenia ma być dostępny jego numer i PDF.

Zakres obejmuje również jednolity katalog produktów Firmino z trwałymi kodami
produktów, przygotowany na co najmniej 9 999 wzorów.

## 2. Ustalenia biznesowe

| Obszar | Ustalenie |
| --- | --- |
| Dokument sprzedaży | Rachunek (`fhan` w Firmino) |
| VAT | Sprzedaż zwolniona z VAT; kod/stawka zostaną pobrane z konfiguracji Firmino, nie wpisywane na sztywno w kodzie |
| Moment wystawienia | Tylko po potwierdzonej płatności online lub ręcznym potwierdzeniu pobrania (COD) |
| E-mail | Firmino automatycznie wysyła rachunek na e-mail kupującego |
| Dostawa | Oddzielna pozycja dokumentu o nazwie `Dostawa — {metoda}` |
| Korekty i zwroty | Na pierwszym etapie wykonywane ręcznie w Firmino |
| Katalog produktów | Produkt jest synchronizowany z Firmino przy opublikowaniu/aktywacji w sklepie |
| Stare rozwiązanie | Merit jest usuwany z przepływu; nie używamy jego sekretów ani endpointów |

> Działalność nierejestrowana: limit przychodu w jednym kwartale w 2026 r.
> wynosi 10 813,50 zł (225% minimalnego wynagrodzenia). Limit wymaga kontroli
> operacyjnej, ale nie będzie blokował sprzedaży automatycznie bez osobnej,
> świadomie zatwierdzonej reguły biznesowej.

## 3. Kod produktu Firmino

### Format

```
PDZ-{ISO2}-{KATEGORIA}-{WIDOK4}-{JĘZYK}
```

Przykład dla wzoru widocznego w sklepie jako „Podróżówka Hiszpania, N V01 ES”:

```
PDZ-ES-NAT-0001-ES
```

| Segment | Przykład | Znaczenie |
| --- | --- | --- |
| `PDZ` | `PDZ` | Stały prefiks Podróżówki |
| `ISO2` | `ES` | Kod ISO2 kraju odbiorcy |
| `KATEGORIA` | `NAT` | Stabilny kod kategorii, nie jej pierwsza litera |
| `WIDOK4` | `0001` | Numer widoku, zawsze cztery cyfry |
| `JĘZYK` | `ES` | Główny język wzoru |

Proponowane kody kategorii: `NAT` (Natura), `ARC` (Architektura), `SZT`
(Sztuka), `WYD` (Wydarzenia), `POS` (Postacie). Kod kategorii będzie osobnym,
niemodyfikowalnym polem technicznym — zmiana widocznej nazwy kategorii nie
zmieni kodów już sprzedanych produktów.

### Zasady trwałości

- Kod powstaje raz przy pierwszej publikacji produktu i jest **niezmienny**.
- Cena, nazwa wyświetlana, opis i zdjęcie nie należą do kodu — mogą się zmieniać.
- Dodatkowy język wybrany przy zakupie **nie tworzy nowego produktu**. Jest
  wariantem danej pozycji zamówienia i znajdzie się w jej nazwie/opisie na
  rachunku.
- Format mieści się w limicie 40 znaków kodu artykułu Firmino i pozwala mieć
  znacznie więcej niż 9 999 pozycji w całym katalogu.

### Rozdzielenie kodu produktu i QR

Kod artykułu Firmino oraz kod QR nie mogą być tym samym identyfikatorem.
Jeden wzór jest sprzedawany wielokrotnie, natomiast każda fizyczna kartka ma
swój własny QR i może zostać zarejestrowana tylko raz.

| Identyfikator | Przykład | Jeden na | Zastosowanie | Przekazanie do Firmino |
| --- | --- | --- | --- | --- |
| Kod produktu | `PDZ-ES-NAT-0001-ES` | wzór/produkt | katalog, cena i pozycja rachunku | **tak**, jako `article.code` |
| Kod inwentarza | `POD-7FA12C9E-003` | wydrukowany egzemplarz | wewnętrzna identyfikowalność produkcji i reklamacji | nie |
| Claim code | `PDZ-7KQ4-M2ZW` | wydrukowany egzemplarz | krótki kod pomocniczy pod QR, dla obsługi i ręcznego zgłoszenia | nie |
| Token QR | losowy sekret w adresie `/r/{token}` | wydrukowany egzemplarz | otwiera formularz rejestracji dla Obdarowanego | **nigdy** |

Przy rachunku dziesięciu identycznych kartek Firmino otrzyma jedną pozycję
artykułu `PDZ-ES-NAT-0001-ES` w ilości `10`; system Podróżówki zachowa pod nią
dziesięć kodów inwentarza, claim codes i tokenów QR. Jest to prawidłowe
rozliczenie księgowe oraz nie ujawnia sekretów QR na dokumencie sprzedaży.

W razie potrzeby w wewnętrznej notatce zamówienia można zapisać liczbę
wygenerowanych kodów QR. Nie wpisujemy pojedynczych tokenów QR ani listy claim
codes do dokumentu klienta w Firmino.

### Wymagane doprecyzowanie bezpieczeństwa QR przed produkcją

Obecny model ma prawidłową logikę: claim code jest unikalny, a QR prowadzi do
oddzielnego, losowego tokenu i po rejestracji nie może zostać użyty ponownie.
Przed produkcją należy jednak ujednolicić generator na kryptograficzny token
co najmniej 256-bitowy, zapisywać wyłącznie jego SHA-256 oraz wymusić domenę
właściwą dla środowiska druku (UAT dla prób, domena produkcyjna dla realnego
druku). To jest zadanie bezpieczeństwa QR niezależne od Firmino.

## 4. Stan obecny i konsekwencje techniczne

Obecny proces ma neutralne wywołanie `issue-fiscal-document`, uruchamiane po
płatności HotPay/Przelewy24 oraz po potwierdzeniu COD. Samo wystawienie i
pobieranie PDF są jednak oparte na Merit.

Zachowujemy nazwę funkcji `issue-fiscal-document`, aby nie zrywać istniejących
wywołań webhooków. Wymieniamy jej implementację na Firmino. Dzięki temu
integracje płatnicze nie wymagają przebudowy.

Istniejące pola zamówienia (`fiscal_document_status`, numer, identyfikator
zewnętrzny, data, URL i błąd) pozostają wspólną historią dokumentu. Dodamy
wyłącznie pola niezbędne do identyfikacji dostawcy i synchronizacji produktu.

## 5. Etapy wdrożenia

### Etap A — model danych i katalog produktów

1. Dodać techniczny kod kategorii i jednorazowo uzupełnić go dla obecnych
   kategorii.
2. Dodać do `card_designs` pola:
   - `product_code` (unikalny, maks. 40 znaków),
   - `firmino_article_id`,
   - `firmino_synced_at`,
   - `firmino_sync_error`.
3. Wygenerować kody dla obecnych produktów, bez zmiany ich nazw widocznych w
   sklepie.
4. Dodać do zamówień `fiscal_provider = 'firmino'` dla pełnego audytu.
5. Utworzyć migrację z ograniczeniami unikalności i indeksami.
6. Zachować powiązanie `order_item → inventory_unit → QR`, ale nie przenosić
   identyfikatorów pojedynczej sztuki do kartoteki artykułu Firmino.

**Kryterium odbioru:** każdy aktywny wzór ma jeden trwały kod produktu;
nie da się utworzyć dwóch produktów o tym samym kodzie.

### Etap B — bezpieczna konfiguracja

1. Dodać wyłącznie w sekretach Supabase:
   - `FIRMINO_LOGIN`,
   - `FIRMINO_PASSWORD`,
   - `FIRMINO_COMPANY_SHORT_NAME` (opcjonalnie — pusty dla jednego konta),
   - `FIRMINO_ENABLED`.
2. Nie przechowywać loginu, hasła ani nagłówka Basic Auth w tabelach,
   frontendzie, logach ani w GitHub.
3. Domyślnie pozostawić `FIRMINO_ENABLED=false`; DEV ma tryb symulacji,
   dopóki nie zostanie wskazane konto/testowy obieg dokumentów.
4. Dodać w panelu administratora wyłącznie status integracji (skonfigurowana /
   brak sekretów / błąd), bez możliwości odczytania poświadczeń.

**Kryterium odbioru:** administrator widzi stan konfiguracji, ale nie może
odczytać żadnego sekretu.

### Etap C — synchronizacja artykułów z Firmino

1. Utworzyć funkcję serwerową `sync-firmino-article`.
2. Po aktywacji/publikacji produktu funkcja:
   - tworzy artykuł w Firmino z `product_code`, nazwą, jednostką `szt.` i
     prawidłową stawką zwolnioną,
   - zapisuje zwrócone ID artykułu,
   - przy kolejnym uruchomieniu aktualizuje artykuł, zamiast tworzyć duplikat.
3. Dodać w panelu administratora kolejkę/status: oczekuje, zsynchronizowano,
   błąd oraz przycisk ponowienia dla pojedynczego produktu.
4. Ograniczyć tempo masowej synchronizacji do limitu API Firmino (500 żądań
   dziennie według dokumentacji). Nie wykonujemy jednorazowego importu 10 tys.
   produktów.

**Kryterium odbioru:** ponowienie operacji nie tworzy duplikatu w Firmino;
błąd jednego artykułu nie blokuje reszty katalogu.

### Etap D — wystawienie i wysyłka rachunku

1. Zastąpić w `issue-fiscal-document` wywołania Merit operacjami Firmino.
2. Po opłaceniu zamówienia utworzyć dokument `fhan` ze stanem `paid`.
3. Zbudować pozycje dokumentu:
   - jedna pozycja dla każdego wzoru (kod Firmino + ilość + cena),
   - dodatkowy język dopisany do nazwy/specyfikacji pozycji,
   - osobna pozycja `Dostawa — {metoda dostawy}`.
4. Utworzyć lub wyszukać kontrahenta na podstawie danych zamówienia; identyfikator
   klienta zapisać do dalszych dokumentów.
5. Po udanym wystawieniu wysłać dokument e-mailem przez endpoint Firmino.
6. Zapisać w zamówieniu numer dokumentu, ID Firmino, datę i status `issued`.
7. Zapewnić idempotencję: powtórzony webhook lub odświeżenie strony nie może
   wystawić drugiego rachunku.

**Kryterium odbioru:** jedno opłacone zamówienie ma dokładnie jeden rachunek,
z poprawnymi pozycjami i wysłanym e-mailem.

### Etap E — PDF, administracja i wycofanie Merit

1. Przepisać `fiscal-document-pdf`, aby pobierał PDF z Firmino przez backend.
2. Zachować kontrolę dostępu: dokument widzi tylko właściciel zamówienia lub
   administrator.
3. Zmienić w panelu nazwę „Fiskalizacja” na „Dokumenty sprzedaży”.
4. Pozostawić ekran błędów i ręcznego oznaczenia rozwiązania; będzie obsługiwał
   sytuacje wymagające ręcznej korekty w Firmino.
5. Usunąć z kodu, konfiguracji wdrożeń i sekretów wszystkie zależności Merit
   dopiero po pozytywnym teście końcowym Firmino.

**Kryterium odbioru:** kupujący pobiera PDF, administrator widzi błąd oraz może
oznaczyć ręczne rozwiązanie, a repozytorium nie zawiera aktywnych wywołań Merit.

### Etap F — testy i kolejność środowisk

1. Testy jednostkowe generatora kodów produktu i idempotencji.
2. DEV: test symulacji dokumentu bez prawdziwego wystawiania.
3. UAT: jeden kontrolowany test rzeczywistego rachunku na dedykowanym koncie lub
   po uprzednim potwierdzeniu bezpiecznego trybu testowego Firmino.
4. Test ścieżki: produkt → koszyk → HotPay/Przelewy24 → opłacenie → rachunek
   → e-mail → PDF → brak duplikatu po ponownej notyfikacji.
5. Test wielosztukowy: jedna pozycja rachunku o ilości 10 oraz dziesięć różnych
   QR/claim codes przypisanych do tych egzemplarzy.
6. Dopiero po zatwierdzeniu UAT: produkcja.

## 6. Zakres świadomie odłożony

- automatyczne korekty i zwroty w Firmino,
- automatyczne blokowanie sprzedaży po zbliżeniu do limitu działalności
  nierejestrowanej,
- masowy import całych 10 tys. artykułów jednego dnia,
- publiczne przekazywanie danych logowania Firmino do aplikacji.

## 7. Checklista przed rozpoczęciem implementacji

- [ ] W Firmino ustawione dane sprzedawcy, dokument „Rachunek” i stawka
      zwolniona z VAT.
- [ ] Potwierdzone, że aktywne konto Firmino ma dostęp do API oraz wysyłki
      dokumentu e-mailem.
- [ ] Ustalony e-mail nadawcy i szablon wiadomości w Firmino.
- [ ] Dodane sekrety Firmino do właściwego środowiska Supabase — wyłącznie przez
      panel sekretów.
- [ ] Zatwierdzone kody kategorii `NAT`, `ARC`, `SZT`, `WYD`, `POS` albo ich
      docelowy słownik.
- [ ] Wskazane, czy test UAT może wystawić rzeczywisty dokument, czy używamy
      konta/testowego obiegu Firmino.

## 8. Źródła techniczne

- Firmino API: `https://www.firmino.pl/api/`
- Dokumenty sprzedaży: `https://www.firmino.pl/api/dokumenty-sprzedazy/`
- Artykuły: `https://www.firmino.pl/api/towary-uslugi/`
- Kontrahenci: `https://www.firmino.pl/api/kontrahenci/`
