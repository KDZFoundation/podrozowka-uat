# Konfiguracja runtime UAT

Projekt Vercel: `podrozowka-uat`
Gałąź: `uat`
Supabase UAT: `nqqephusxnxzzkfulfae`
Publiczny adres UAT: `https://podrozowka-uat-one.vercel.app`

## Vercel — Environment Variables

Ustaw poniższe wartości dla środowiska **Production** projektu
`podrozowka-uat` (jest to produkcyjne wdrożenie osobnego projektu UAT):

| Nazwa | Wartość |
| --- | --- |
| `VITE_APP_ENV` | `uat` |
| `VITE_SUPABASE_PROJECT_ID` | `nqqephusxnxzzkfulfae` |
| `VITE_SUPABASE_URL` | `https://nqqephusxnxzzkfulfae.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable/anon key projektu Supabase UAT |
| `VITE_PUBLIC_APP_URL` | `https://podrozowka-uat-one.vercel.app` |
| `VITE_INPOST_GEOWIDGET_TOKEN` | Wyłącznie token sandbox UAT, jeżeli testujemy wybór paczkomatu |

Nie dodawaj do Vercel kluczy serwerowych: `SUPABASE_SERVICE_ROLE_KEY`,
`P24_API_KEY`, `P24_CRC_KEY`, `INPOST_SHIPX_TOKEN`, `MERIT_API_KEY` ani
`INTERNAL_FN_SECRET`.

## Supabase UAT — Edge Function Secrets

`SUPABASE_URL`, `SUPABASE_ANON_KEY` i `SUPABASE_SERVICE_ROLE_KEY` są
udostępniane funkcjom Edge przez platformę Supabase. Nie kopiujemy ich do
Vercel.

Ustaw w **Edge Function Secrets** UAT:

| Nazwa | Wartość UAT |
| --- | --- |
| `SITE_URL` | `https://podrozowka-uat-one.vercel.app` |
| `FISCAL_ENABLED` | `false` |
| `INTERNAL_FN_SECRET` | Nowa losowa wartość tylko dla UAT |
| `P24_SANDBOX` | `true` — jeżeli integracja płatności jest testowana |
| `P24_MERCHANT_ID`, `P24_POS_ID`, `P24_CRC_KEY`, `P24_API_KEY` | Wyłącznie dane sandbox Przelewy24, gdy są dostępne |
| `INPOST_SHIPX_ENV` | `sandbox` — jeżeli wysyłki są testowane |
| `INPOST_SHIPX_ORGANIZATION_ID`, `INPOST_SHIPX_TOKEN` | Wyłącznie dane sandbox, gdy są dostępne |

Nie ustawiaj kluczy Merit/Fakturowni na UAT. Przy `FISCAL_ENABLED=false`
funkcja fiskalizacji celowo nie wywoła dostawcy zewnętrznego.

## Kontrola po konfiguracji

1. Wdrożyć funkcje Edge na projekt UAT.
2. Wykonać redeploy projektu `podrozowka-uat` z gałęzi `uat`.
3. Sprawdzić w UAT logowanie, koszyk, płatność sandbox i rejestrację QR.
4. Dopiero po akceptacji UAT przygotować identyczny audyt dla PROD.
