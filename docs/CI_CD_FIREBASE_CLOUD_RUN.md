# CI/CD UAT: Firebase Hosting + Cloud Run

## Stan

Repozytorium UAT używa gałęzi `main`. Frontend buduje Vite i jest publikowany
przez Firebase Hosting. Backend Cloud Run `podrozowka-uat` pozostaje na razie
zarządzany przez Google AI Studio/Firebase Studio, bez automatycznego deployu z
GitHub — dzięki temu nie jest wymagane rozliczanie Cloud Build.

Workflow `.github/workflows/firebase-cloudrun.yml` wykonuje kontrolę jakości na
PR i po pushu do `main`. Wdrożenie uruchamia się dopiero po udanym buildzie.

## Konfiguracja GitHub

Potwierdzone parametry UAT są wpisane w workflow i konfigurację Hostingu:

- projekt Google Cloud/Firebase: `podrozowka` (numer `765668033365`),
- Firebase Hosting site: `podrozowka`,
- Cloud Run service: `podrozowka-uat`,
- Cloud Run region: `us-west1`.

Sekrety (Actions → Secrets):

- `GCP_WORKLOAD_IDENTITY_PROVIDER`,
- `GCP_SERVICE_ACCOUNT`.

Workflow używa bezkluczowego Workload Identity Federation. Nie używamy tokena
Firebase CLI ani klucza JSON konta serwisowego. Reguły Firestore są wdrażane
osobno po skonfigurowaniu dedykowanego uwierzytelnienia Google Cloud.

## Blockery przed pierwszym deployem

Repozytorium zawiera jeszcze pozostałości migracji z Supabase (`src/integrations/supabase`,
Supabase Auth i stare Edge Functions). Workflow może zbudować i opublikować
frontend, ale nie oznacza to zakończenia migracji backendu. Przed przełączeniem
UAT trzeba:

1. utrzymać bindingi Workload Identity dla repozytorium UAT;
2. zastąpić odwołania do Supabase odpowiednimi endpointami Cloud Run/Firebase;
3. dodać test smoke dla `/api/health`, logowania, koszyka i webhooka płatności;
4. po włączeniu rozliczania Cloud Build rozważyć automatyczny deploy Cloud Run.
