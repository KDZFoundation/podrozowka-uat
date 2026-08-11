# Plan wdrożenia modułu Autorzy

## Cel

Jedno miejsce do prowadzenia kartoteki autorów zdjęć, statusu umowy licencyjnej i danych potrzebnych do prawidłowego oznaczenia autora na Podróżówce.

## Zakres wdrożony w DEV (kod + migracja)

- kartoteka autora: nazwa wyświetlana, nazwa prawna, e-mail, profil społecznościowy, strona, biogram i notatki;
- status umowy: szkic, wysłana, podpisana, wygasła, zakończona;
- daty podpisania i wygaśnięcia oraz link do bezpiecznie przechowywanego pliku umowy;
- powiązanie autora ze wzorem w Kreatorze Wzorów;
- zachowanie wzoru po usunięciu autora (`ON DELETE SET NULL`);
- RLS: pełny dostęp wyłącznie dla administratorów;
- wyszukiwanie, edycja i usuwanie autora w panelu administracyjnym.

## Kolejne kroki

1. Zastosować migrację na DEV i zweryfikować RLS.
2. Dodać upload umowy do prywatnego bucketu Supabase Storage zamiast publicznych linków.
3. Dodać widok „Wzory autora” z filtrowaniem po kraju, kategorii i statusie publikacji.
4. Dodać walidację terminu umowy i ostrzeżenia przed wygaśnięciem.
5. Po akceptacji przenieść migrację i kod na UAT, a następnie PROD.

## Zasady bezpieczeństwa

Nie przechowujemy PESEL ani pełnego adresu autora w kartotece aplikacji. Umowy i dane wrażliwe powinny być dostępne tylko uprawnionym administratorom.
