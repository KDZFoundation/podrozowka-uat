# Konfiguracja runtime UAT

Status: obowiązujące. Ostatnia aktualizacja: 2026-09-10.

UAT jest odrębnym środowiskiem Firebase projektu `podrozowka` oraz backendu
Vercel `podrozowka-uat`. Nie używa już Supabase Edge Functions ani Przelewy24.

## Źródła wdrożenia

- Repozytorium: `KDZFoundation/podrozowka-uat`, gałąź `main`.
- Firebase Hosting UAT: `https://podrozowka.web.app`.
- Backend UAT: `https://podrozowka-uat-one.vercel.app`.
- Workflow Firebase używa jawnego pliku `firebase.uat.json` i projektu
  `podrozowka`; `.firebaserc` nie ma domyślnego projektu.

Nie uruchamiaj ręcznie `firebase deploy` bez jednoczesnego `--project` oraz
`--config`. Dla UAT właściwa komenda jest równoważna krokowi workflow:

```text
firebase deploy --project podrozowka --config firebase.uat.json \
  --only hosting,firestore:rules,firestore:indexes
```

## Vercel UAT — wartości serwerowe

Poniższe wartości są konfiguracją backendu, nie ustawieniami Firestore. Nie
umieszczaj sekretów w kodzie, `VITE_*` ani dokumentach Firestore.

| Nazwa | Wymaganie |
| --- | --- |
| `GCP_PROJECT_ID` | `podrozowka` |
| `FIRESTORE_DATABASE_ID` | `ai-studio-podrozowkauat-e1d9b39b-c759-477c-98ea-34396a1afd2f` |
| `FIREBASE_AUTH_PROJECT_ID` | opcjonalne `podrozowka`; przy braku używany jest `GCP_PROJECT_ID` |
| WIF (`GCP_PROJECT_NUMBER`, konto usługi, pool i provider) | kompletne dla backendu Vercel |
| `FRONTEND_ORIGIN`, `PUBLIC_APP_URL` | publiczny origin UAT HTTPS |
| `CHECKOUT_RETURN_ORIGIN` | origin UAT HTTPS, bez ścieżki i parametrów |
| `SALES_ENABLED` | `false` dopóki nie rozpoczynamy testów zamówień UAT |

W środowisku Vercel brak `GCP_PROJECT_ID` albo `FIRESTORE_DATABASE_ID` kończy
operację błędem konfiguracji. Kod nie użyje wtedy domyślnego projektu UAT.

## Konfiguracja frontendu

Firebase SDK UAT może korzystać z zatwierdzonego pliku
`firebase-applet-config.json`. Produkcyjny build (`VITE_APP_ENV=production`)
wymaga natomiast pełnego zestawu: `VITE_FIREBASE_API_KEY`,
`VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
`VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID` i
`VITE_FIREBASE_APP_ID`. Częściowa konfiguracja jest błędem, żeby nie mieszać
projektów.

Workflow UAT ustawia jawnie `VITE_APP_ENV=uat`,
`VITE_CATALOG_SOURCE=firestore`, `VITE_ENABLE_TEST_DATA_CLEANUP=true` oraz
adres backendu UAT. Te flagi nie mogą być kopiowane do PROD.

## POD

Przed realnym generowaniem PDF muszą istnieć dokładne, sprawdzone wartości:

- `POD_PRINT_ARTIFACT_BUCKET`,
- `POD_PRINT_ASSET_ALLOWED_HOSTS`,
- `POD_PRINT_FONT_ALLOWED_HOSTS`,
- `POD_PRINT_TEMPLATE_FRONT_SHA256`,
- `POD_PRINT_TEMPLATE_BACK_SHA256`,
- hashe pinowanych fontów w rejestrze źródeł.

Hashy nie wolno zastępować przykładowymi wartościami. Endpoint readiness ma
pozostać zablokowany, dopóki nie przejdzie kontroli artefaktów i fizycznej próby.

## Kontrola przed wdrożeniem

1. `bun run validate:deployment-config`
2. `bun run typecheck`, `bun run lint`, `bun run test`, `bun run test:integration`
3. UAT smoke: logowanie, katalog, koszyk oraz — tylko po włączeniu sprzedaży —
   testowy checkout i webhook.

Konfiguracja produkcyjna jest niezależna. Wzorcem jest
`firebase.prod.example.json`; właściwy plik i projekt pozostają w repo PROD.
