# CI/CD UAT: Firebase Hosting + Cloud Run

## Stan

Repozytorium UAT używa gałęzi `main`. Frontend buduje Vite i jest publikowany
przez Firebase Hosting. Serwer Express z `server.ts` jest wdrażany jako usługa
Cloud Run. Google AI Studio/Firebase Studio pozostaje narzędziem developerskim.

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

Uwierzytelnianie korzysta z Workload Identity Federation. Nie należy dodawać
klucza JSON konta serwisowego do repozytorium ani do sekretów.

## Blockery przed pierwszym deployem

Repozytorium zawiera jeszcze pozostałości migracji z Supabase (`src/integrations/supabase`,
Supabase Auth i stare Edge Functions). Workflow może zbudować i opublikować
frontend, ale nie oznacza to zakończenia migracji backendu. Przed przełączeniem
UAT trzeba:

1. ustawić sekrety runtime Cloud Run (HotPay, InPost, Resend itd.) w Secret Manager;
2. zastąpić odwołania do Supabase odpowiednimi endpointami Cloud Run/Firebase;
3. zaostrzyć `firestore.rules` — obecna reguła `allow read, write: if true` jest
   niedopuszczalna dla UAT ani produkcji;
4. dodać test smoke dla `/api/health`, logowania, koszyka i webhooka płatności;
5. dopiero wtedy włączyć automatyczny deploy na `main`.
