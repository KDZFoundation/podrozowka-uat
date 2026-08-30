# Zamrożone manifesty druku POD

## Kontrakt

Manifest druku jest kanonicznym wejściem do PDF. Geometria, arkusze, sloty i duplex nadal pochodzą wyłącznie z `planPodImposition()`. Serwer odczytuje zadania QR, jednostki, wzory, kraje i szablony językowe, a następnie buduje manifest przez `buildPodPrintManifest()`.

Kanoniczny SHA-256 jest liczony z UTF-8 wyniku `serializePodPrintManifest()`. Payload nie zawiera `created_at`, `created_by`, `frozen_at` ani innych metadanych operacyjnych.

## Firestore

- `pod_print_manifests/{manifest_id}` przechowuje nagłówek i stan `writing` lub `frozen`.
- `pod_print_manifest_chunks/{manifest_id}-{chunk_index}` przechowuje maksymalnie 100 pozycji.
- Identyfikatory dokumentów są deterministyczne, a utworzenie używa precondition `exists:false`.
- Finalizacja nagłówka używa dokładnego `updateTime` odczytanego po zapisaniu chunków.
- Klient może czytać dokumenty wyłącznie jako aktywny administrator i nigdy nie może ich zapisywać bezpośrednio.

Endpoint nie zwraca pełnego manifestu, chunków i kanonicznego JSON w jednej odpowiedzi. Operacja `freeze` lub `get_header` zwraca wyłącznie nagłówek. Klient pobiera kolejne fragmenty przez `get_chunk` i sam rekonstruuje oraz weryfikuje SHA-256 przed renderowaniem. Frontend wywołuje endpoint przez `backendApiUrl()`, ponieważ UAT rozdziela Firebase Hosting i API Vercel.

Chunk ma najwyżej 100 pozycji i jednocześnie najwyżej 256 KiB kanonicznego UTF-8 payloadu. Limit bajtowy jest celowo znacznie niższy niż 1 MiB, ponieważ reprezentacja pól w Firestore REST jest większa od kanonicznego JSON.

## Identyfikator i rewizja

`manifest_id` ma postać `pm-{sha256}`. Hash klucza obejmuje wersję manifestu, wersję algorytmu, `batch_id`, jawną `batch_revision` oraz posortowane `print_job_ids`. Zmieniony skład paczki lub rewizja tworzy inny identyfikator. Zmienione wejście renderowania przy tym samym identyfikatorze powoduje konflikt SHA-256 zamiast nadpisania.

## Ograniczenia

W środowisku Vercel UAT trzeba ustawić `PUBLIC_APP_URL` na publiczny origin aplikacji z Firebase Hosting. Alternatywnie usługa użyje `FRONTEND_ORIGIN`; ta zmienna określa też dozwolony origin CORS API. Brak obu zmiennych lub wartość, która nie jest URL-em HTTP(S), blokuje zamrożenie manifestu przed zapisaniem QR. Adres nie jest wpisany na stałe w kodzie.

Integracja danych produkcyjnych nadal przypisuje wyłącznie `CURRENT_POSTCARD_PRINT_FORMAT`. Obsługa wyboru różnych wersjonowanych formatów z Firestore pozostaje osobnym etapem.

Manifest zapisuje URL grafiki i dostępne pole wersji/generacji. Hash URL-a oraz identyfikatora wersji nie chroni przed podmianą binarnej zawartości pod tym samym adresem. Przed etapem archiwizacji artefaktów grafiki powinny otrzymać niezmienne wersjonowane ścieżki albo hash binarny.
