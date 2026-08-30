# Kanoniczne artefakty PDF POD

## Zakres gwarancji

Etap 4 rozdziela dwie różne własności:

1. **Identyczny reprint** jest gwarantowany przez pobranie dokładnych bajtów zapisanych w prywatnym Cloud Storage. Reprint nie uruchamia `planPodImposition`, Reacta, `html2canvas`, jsPDF ani pobierania assetów.
2. **Ponowne renderowanie manifestu** nie jest obecnie gwarantowane byte-for-byte. Stałe metadane jsPDF usuwają znane źródła losowości w samym kontenerze PDF, lecz wynik obrazów może zależeć od przeglądarki, `html2canvas`, rasteryzacji fontów, platformy oraz treści dostępnej pod mutowalnymi URL-ami.

Test kontrolny tworzy dwukrotnie ten sam prosty dokument jsPDF w jednym środowisku i porównuje bajty oraz SHA-256. Nie jest to dowód reprodukowalności pełnego renderera HTML.

## Model danych

Dokument `pod_print_artifacts/{artifact_id}` ma deterministyczne ID wyprowadzone z wersji artefaktu, `batch_id` używanego jako `print_job_id` i `manifest_sha256`. Dokument jest tworzony wyłącznie przez backend z precondition `currentDocument.exists=false`. Zawiera wersje, odwołanie do manifestu, oba hashe, bucket, object, generation, metageneration, rozmiar, MIME, CRC32C, opcjonalne MD5, formaty, liczby arkuszy i pozycji, `immutable=true`, `status=ready` oraz audytowe `created_at`.

Bezpośrednie zapisy klienta do kolekcji są zabronione przez reguły Firestore. Aktywny administrator może odczytać metadane. Backend używa istniejącej warstwy Firestore REST, bez Firebase Admin SDK w kodzie aplikacji.

Obiekt Storage ma ścieżkę:

```text
pod-print-artifacts/{batch_id}/{manifest_sha256}.pdf
```

Bucket określa serwerowa zmienna `POD_PRINT_ARTIFACT_BUCKET`. Bucket nie może być publiczny. Własne metadane obiektu zawierają `manifest_sha256`, `pdf_sha256`, `renderer_version`, `print_job_id` i `content_type`.

## Protokół utworzenia

1. Klient administracyjny pobiera i lokalnie weryfikuje zamrożony manifest.
2. `planPodImposition()` pozostaje jedynym źródłem geometrii użytej wcześniej do zbudowania manifestu; etap artefaktu nie przelicza geometrii.
3. Przeglądarka renderuje PDF z pozycji manifestu. jsPDF otrzymuje stałą datę `2000-01-01T00:00:00Z`, file ID wyprowadzony z `manifest_sha256` oraz stałe properties.
4. Przeglądarka wysyła bajty PDF przez uwierzytelniony endpoint. Nie przesyła zaufanego SHA-256.
5. Backend ponownie odczytuje cały zamrożony manifest, weryfikuje chunki i hash, wymusza serwerowo `batch_id` i wersję renderera oraz oblicza SHA-256 otrzymanych bajtów.
6. Backend wykonuje JSON API multipart upload z `ifGenerationMatch=0`, zapisując dane i wymagane metadane atomowo w jednym żądaniu.
7. Backend ponownie pobiera metadane i bajty konkretnej generation, sprawdza rozmiar, MIME, wymagane metadane i SHA-256.
8. Dokument Firestore jest tworzony create-only. Identyczny dokument oznacza sukces po retry; różnica to konflikt.
9. Klient pobiera przez endpoint reprintu dokładną zapisaną generation i dopiero te bajty zapisuje użytkownikowi.

## Obsługa 412 i awarii częściowych

| Stan | Zachowanie przy retry |
| --- | --- |
| Upload nie dotarł do Storage | Dokument nie powstaje; retry ponawia create-only upload. |
| Upload się udał, odpowiedź zaginęła | Retry dostaje 412 i weryfikuje istniejący obiekt. |
| Upload się udał, Firestore zawiódł | Retry: 412, weryfikacja obiektu, ponowienie create-only dokumentu. |
| Obiekt istnieje, dokument nie istnieje | Identyczny obiekt jest zaakceptowany, tworzony jest brakujący dokument. |
| Dokument i obiekt są zgodne | Pełna weryfikacja wskazanej generation i idempotentny sukces. |
| Obiekt ma inne bajty, rozmiar lub metadane | Twardy konflikt/hash/metadata mismatch; bez nadpisania. |
| Dokument ma inny manifest, hash, ścieżkę lub generation | `pod_artifact_firestore_conflict`; bez nadpisania. |
| Dokument istnieje, obiektu brak | `pod_artifact_missing_object`; bez automatycznego renderowania. |
| Dwa równoległe żądania | Jeden upload wygrywa, drugi dostaje 412; jeden create dokumentu wygrywa; oba zbiegają do tego samego artefaktu. |
| Proces ginie po zapisie Firestore | Retry weryfikuje istniejący obiekt i dokument, po czym zwraca sukces. |

Firestore i Storage nie są łączone transakcją. Upload nie znajduje się w callbacku transakcji Firestore i nie może zostać niejawnie powtórzony przez retry transakcji.

## Reprint

`GET /api/pod/print-artifact?artifact_id=...` wymaga aktywnego administratora. Serwer pobiera konkretną `storage_generation`, sprawdza bucket, object, generation, metageneration, rozmiar, CRC32C, opcjonalne MD5, wymagane metadane i SHA-256. Jakakolwiek różnica kończy operację błędem. Nie istnieje fallback do ponownego generowania PDF.

## Granica zaufania i dalsze ryzyka

Obecna architektura wymusza renderowanie DOM w przeglądarce. Backend oblicza hash z faktycznie otrzymanych bajtów i nigdy nie ufa hashowi klienta, ale nie potrafi semantycznie udowodnić, że przesłany PDF wizualnie odpowiada manifestowi. Dostęp ogranicza istniejąca aktywna rola administratora.

Pełna reprodukowalność ponownego renderowania wymaga osobnego etapu: snapshotowania binarnych grafik i fontów do niezmiennych obiektów, zapisania ich hashy i generations w manifeście, eliminacji fontów sieciowych oraz hermetycznego, wersjonowanego środowiska Chromium/html2canvas. Do tego czasu kanonicznym źródłem reprintu są wyłącznie zapisane bajty pierwszego zaakceptowanego artefaktu.

Limit request body platformy hostingowej musi zostać potwierdzony dla realnych rozmiarów produkcyjnych PDF. Jeśli PDF przekracza limit funkcji Vercel, potrzebny będzie osobny, nadal warunkowy protokół uploadu bez publicznego obiektu i bez utraty `ifGenerationMatch=0`.

## Podstawa implementacji

Przed implementacją sprawdzono wskazane zasoby Context7: `/googleapis/nodejs-storage`, `/googleapis/nodejs-firestore` i `/parallax/jspdf`, a także dokumentację GCS request preconditions/JSON multipart upload. Pozostano przy istniejącej warstwie Google REST zamiast dodawania `@google-cloud/storage`: JSON API zapewnia równoważne `ifGenerationMatch=0`, atomowy zapis danych z metadanymi i odczyt konkretnej generation bez wprowadzania drugiej biblioteki dostępu do Google Cloud.
