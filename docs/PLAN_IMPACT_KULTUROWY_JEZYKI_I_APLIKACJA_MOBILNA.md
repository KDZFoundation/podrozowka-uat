# Plan przyszłego rozwoju: Impact Kulturowy, języki regionalne i aplikacja mobilna

> Dokument planistyczny. Na tym etapie nie wprowadzamy zmian w kodzie, bazie ani wdrożeniach.

## 1. Cel

Rozbudować grywalizację Podróżówki tak, aby „Impact Kulturowy” pokazywał nie tylko liczbę kartek, ale także kontekst podróży: kraj, region, język i relację z obdarowanym. Model ma obsługiwać kraje wielojęzyczne oraz różne trasy podróżnika.

Przykłady:

- Belgia: Flandria — niderlandzki (flamandzki), Walonia — francuski; dodatkowo należy dopuścić niemiecki jako trzeci język urzędowy.
- Zimbabwe: dla całego kraju Shona jako język główny i angielski jako dodatkowy; dla południa Zimbabwe angielski jako główny i ndebele jako dodatkowy.

## 2. Zasady modelu językowego

1. Kraj może mieć wiele języków i wiele regionów.
2. Każdy profil podróży ma dokładnie jeden język główny oraz opcjonalny język dodatkowy.
3. System proponuje języki na podstawie kraju i regionu, ale podróżnik może zmienić propozycję.
4. Region jest opcjonalny dla krajów jednorodnych, a wymagany tylko tam, gdzie ma znaczenie dla rekomendacji.
5. Język główny i dodatkowy są zapisywane w zamówieniu jako migawka. Późniejsze zmiany słownika nie mogą zmienić treści już opłaconego zamówienia ani wygenerowanego PDF.
6. Kod QR i rejestracja kartki pozostają przypisane do konkretnej sztuki. Obdarowany sam wybiera język rejestracji z aktywnych języków dostępnych dla kraju kartki; system może jedynie zaproponować język główny z zakupu.

## 3. Docelowe dane w Firestore

### `countries`

Istniejąca kolekcja krajów pozostaje źródłem nazwy, kodu i aktywności kraju.

### `country_languages`

Relacja kraj–język:

- `country_code`, `language_code`;
- `is_official`, `is_active`;
- `population_share` — informacyjnie, bez automatycznego wymuszania wyboru;
- `regions[]` — kody regionów, w których język jest rekomendowany;
- `sort_order` i opis kontekstu (dom, administracja, szkoła, media).

### `regions`

- `country_code`, `region_code`, nazwa lokalna i nazwa wyświetlana;
- opcjonalnie dane geograficzne, aby w przyszłości powiązać region z mapą aplikacji mobilnej.

### `language_profiles`

Gotowe profile wyboru dla kraju/regionu:

- `country_code`, opcjonalny `region_code`;
- `primary_language_code`;
- `secondary_language_code` (opcjonalny);
- `allowed_language_codes[]`;
- `is_default`, `is_active`, opis dla użytkownika.

### Rozszerzenie produktu i zamówienia

Produkt/wzór powinien przechowywać profil lub bazowy język, natomiast pozycja koszyka i zamówienia:

- `primary_language_code`;
- `secondary_language_code`;
- `language_profile_id`;
- migawkę nazw języków, kraju, regionu i treści podziękowania.

Dotychczasowe `language_code` traktujemy jako historyczny język główny. Istniejące produkty dostają profil „cały kraj”, bez zmiany ich treści.

## 4. Panel administratora

W panelu należy dodać:

1. słownik języków — pozostaje centralnym katalogiem 59 języków;
2. konfigurację języków kraju — języki oficjalne, udział informacyjny, aktywność i kolejność;
3. konfigurację regionów — regiony kraju i języki rekomendowane w każdym regionie;
4. profile językowe — główny/dodatkowy język oraz lista dopuszczalnych języków;
5. podgląd produktu z informacją, z jakiego profilu językowego korzysta;
6. walidację, aby nie dało się usunąć języka użytego w opłaconym zamówieniu.

## 5. Sklep, koszyk i zamówienie

Proponowany przebieg:

1. Kupujący wybiera kraj.
2. Jeśli ma to sens, wybiera region lub „cały kraj”.
3. System pokazuje rekomendowany język główny i opcjonalny dodatkowy.
4. Kupujący może zmienić język główny oraz wybrać drugi język tylko z listy dopuszczonej dla danego profilu.
5. Koszyk pokazuje pełne podsumowanie: kraj, region, język główny i dodatkowy.
6. Po opłaceniu wartości są zamrażane w zamówieniu i przekazywane do PDF/POD.

Przykładowe profile:

| Kraj/region | Język główny | Język dodatkowy |
| --- | --- | --- |
| Belgia — cały kraj | wybór profilu | drugi język z profilu |
| Belgia — Flandria | niderlandzki (flamandzki) | francuski |
| Belgia — Walonia | francuski | niderlandzki |
| Belgia — region niemieckojęzyczny | niemiecki | francuski lub niderlandzki |
| Zimbabwe — cały kraj | Shona | angielski |
| Zimbabwe — południe | angielski | ndebele |

## 6. Wpływ kulturowy i grywalizacja

„Impact Kulturowy” powinien łączyć:

- liczbę kupionych, wręczonych i zarejestrowanych kartek;
- liczbę krajów i regionów;
- liczbę języków użytych w realnych relacjach;
- zarejestrowane relacje podróżnik–obdarowany;
- ukończone misje kulturowe;
- aktywność w aplikacji mobilnej.

Nowe elementy:

- **Poznaj kraj** — krótki, redagowany opis kraju, kultury i zasad wyboru języka;
- **Poznaj region** — opis regionu, lokalnego języka i kontekstu;
- **Misje językowe** — np. wręcz kartkę w dwóch językach lub zarejestruj relację w nowym regionie;
- **Mapa relacji** — punkty wynikające z zarejestrowanych kartek, z ograniczeniem dokładności lokalizacji;
- **Ściana relacji** — moderowane, dobrowolnie publiczne wiadomości obdarowanych;
- **Rangi i odznaki** — za różnorodność krajów, regionów, języków i liczbę relacji, nie za samo masowe kupowanie.

Punkty powinny być naliczane zdarzeniowo i idempotentnie. Rejestracja jednej sztuki nie może zostać policzona wielokrotnie przy odświeżeniu strony.

## 7. Zintegrowana aplikacja mobilna inspirowana Been

Planowana aplikacja mobilna ma być częścią ekosystemu Podróżówki, a nie kopią konkretnej aplikacji. Inspiracją funkcjonalną może być [Been — Visited Countries Tracker](https://play.google.com/store/apps/details?id=visited.countries.tracker.been.places.map&hl=pl).

Zakres pierwszej wersji:

- logowanie tym samym kontem co portal;
- mapa odwiedzonych krajów i regionów;
- lista odwiedzonych miejsc oraz historia podróży;
- statystyki krajów, regionów, języków i zarejestrowanych relacji;
- podgląd Impactu Kulturowego, rang, misji i odznak;
- skanowanie kodu QR Podróżówki przez obdarowanego;
- wybór języka rejestracji z aktywnych języków kraju kartki oraz ręczna zmiana języka interfejsu;
- powiadomienia o nowych rejestracjach i postępie misji;
- prywatność: tryb prywatny, przybliżona lokalizacja, zgoda na publikację relacji i możliwość usunięcia danych.

Później można dodać tryb offline, import historii podróży, zdjęcia miejsc i udostępniane podsumowania. Dane mobilne powinny korzystać z tych samych kolekcji Firestore i reguł bezpieczeństwa co portal.

## 8. Kolejność wdrożenia

### Etap 1 — model danych i zgodność wsteczna

- inwentaryzacja istniejących krajów, wzorów, produktów i 59 języków;
- kolekcje krajów, regionów i profili językowych;
- mapowanie istniejącego `language_code` na język główny;
- testy reguł Firestore i migracja danych bez zmiany zachowania sklepu.

### Etap 2 — panel administracyjny

- edycja języków kraju i regionów;
- tworzenie profili językowych;
- walidacja i podgląd wpływu na produkty.

### Etap 3 — sklep i zamówienia

- wybór regionu;
- rekomendacja i ręczna zmiana języka głównego/dodatkowego;
- zapis migawek w koszyku i zamówieniu;
- aktualizacja PDF/POD i QR.

### Etap 4 — Impact Kulturowy

- kraj/region/język w statystykach;
- misje, odznaki i mapa relacji;
- moderacja i ustawienia prywatności.

### Etap 5 — aplikacja mobilna

- specyfikacja UX i API;
- prototyp mapy, statystyk i skanera QR;
- testy bezpieczeństwa i synchronizacji;
- publikacja etapowa po stabilizacji portalu webowego.

Każdy etap najpierw testujemy lokalnie, a dopiero po akceptacji użytkownika synchronizujemy z chmurą.

## 9. Decyzje do doprecyzowania przed implementacją

1. Czy region ma być obowiązkowy w Belgii i Zimbabwe, czy zawsze można wybrać „cały kraj”?
2. Czy podróżnik może wpisać dowolny drugi język z listy kraju, czy tylko języki przypisane do wybranego regionu?
3. Czy udział procentowy języka ma wpływać wyłącznie na rekomendację, czy również na kolejność w sklepie?
4. Które elementy relacji obdarowanego będą publiczne, a które wyłącznie prywatne?
5. Czy aplikacja mobilna ma startować jako PWA, czy od razu jako aplikacja natywna Android/iOS?
