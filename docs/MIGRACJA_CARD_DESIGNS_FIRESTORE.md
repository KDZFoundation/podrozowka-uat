# Migracja `card_designs` do Firestore

## Cel pierwszego etapu

Kolekcja `card_designs` staje się docelowym źródłem danych wzorów dla kreatora, menu **Produkty** i sklepu. Jeden dokument zachowuje wszystkie dane niezbędne do wygenerowania konkretnej Podróżówki: kraj, kategorię, numer widoku, język, treści, kadrowanie, cenę oraz galerię obrazów.

Nie przenosimy jeszcze automatycznie danych do zdalnego Firebase. Najpierw budujemy i sprawdzamy lokalny artefakt migracji. To zapobiega nadpisaniu UAT, dopóki nie mamy kompletnego eksportu z Supabase.

## Dane wejściowe

Eksport JSON musi zawierać dwie tablice (na poziomie głównym lub w `collections`):

```json
{
  "collections": {
    "card_designs": [{ "id": "…", "country_id": "…" }],
    "card_design_images": [{ "id": "…", "card_design_id": "…", "url": "…", "sort_order": 0 }]
  }
}
```

Identyfikatory z Supabase są zachowywane. Dzięki temu późniejsze odwołania z zamówień, magazynu oraz kodów QR nadal wskazują ten sam wzór.

## Docelowy dokument

`card_designs/{id}` zawiera między innymi:

- `country_id`, `category_id`, `author_id`, `view_no`, `language_code`;
- `thank_you_text`, `back_qr_label`, `photo_author`, `crop_settings`;
- `price_grosze` i `currency: "PLN"` — kwota jest całkowitą liczbą groszy;
- `active` — jedyne pole publikacji w sklepie;
- `image_front_url` i uporządkowaną tablicę `images`;
- `schema_version: 1`, `migration_source: "supabase"`.

## Uruchomienie lokalne

Najpierw tylko walidacja:

```powershell
.\node_modules\.bin\tsx.cmd .\scripts\firestore-migrations\transform-card-designs.ts --check
```

Po dostarczeniu pełnego eksportu z Supabase wygeneruj lokalny artefakt:

```powershell
.\node_modules\.bin\tsx.cmd .\scripts\firestore-migrations\transform-card-designs.ts `
  --input .\migration-data\supabase-catalog-export.json `
  --output .\migration-data\generated\card_designs.firestore.json
```

Ten skrypt **nie łączy się z Firebase i niczego nie publikuje**. Dopiero po kontroli liczby dokumentów, obrazów oraz przykładowych wzorów użyjemy osobnego importera dla lokalnego emulatora Firestore.

Eksport ze źródłowego Supabase wymaga pary URL i klucza z **tego samego projektu**. Do pełnej migracji katalogu używamy lokalnie `SUPABASE_URL` oraz `SUPABASE_SERVICE_ROLE_KEY`; klucza nie zapisujemy w repozytorium ani nie wklejamy do czatu. Jeżeli klucz jest błędny albo nie ma uprawnień, eksporter kończy się błędem i nie tworzy pustego pliku udającego migrację.

## Lokalny emulator i import

Firebase CLI wymaga lokalnego **JDK 21 lub nowszego**. Przed uruchomieniem sprawdź:

```powershell
java -version
```

W aktualnym środowisku zainstalowana jest Java 8, która nie jest obsługiwana przez bieżący emulator.

W osobnym terminalu uruchom emulator:

```powershell
.\node_modules\.bin\firebase.cmd emulators:start --only firestore
```

Następnie, w drugim terminalu, najpierw sprawdź artefakt:

```powershell
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
.\node_modules\.bin\tsx.cmd .\scripts\firestore-migrations\import-card-designs-to-emulator.ts --check
```

Właściwy import lokalny:

```powershell
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
.\node_modules\.bin\tsx.cmd .\scripts\firestore-migrations\import-card-designs-to-emulator.ts
```

Importer ma blokadę bezpieczeństwa: bez `FIRESTORE_EMULATOR_HOST` przerywa działanie, więc nie może przypadkowo zapisać katalogu do zdalnej bazy Firebase.

## Kryteria akceptacji przed przełączeniem aplikacji

1. Liczba dokumentów jest zgodna z eksportem `card_designs`.
2. Każdy dokument ma `country_id`, `view_no`, `price_grosze`, `language_code` i `active`.
3. Wszystkie rekordy z `card_design_images` znalazły się w `images` właściwego dokumentu.
4. Kreator, Produkty i Sklep czytają ten sam dokument Firestore — dopiero wtedy usuwamy odczyt Supabase.

### Obrazy zapisane jako `data:`

Firestore nie może przechowywać dużych obrazów Base64 w dokumencie (limit dokumentu to 1 MB). Migrator wyodrębnia je do lokalnego katalogu `migration-data/generated/card-design-assets/`, a skrypt `prepare-hosting-card-images.ts` tworzy z nich dwa statyczne pliki WebP w `public/card-designs/`:

- `thumb.webp` — lekki podgląd w katalogu sklepu;
- `front.webp` — większy podgląd na stronie produktu.

Dokument Firestore zapisuje adresy `/card-designs/{id}/thumb.webp` oraz `/card-designs/{id}/front.webp`. Dzięki temu Firebase Hosting może obsłużyć podglądy na planie Spark bez tworzenia Firebase Storage.
