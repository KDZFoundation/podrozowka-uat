# Plan wdrożenia CI/CD — Podróżówka

**Data aktualizacji:** 07.08.2026 20:57
**Status:** etapy A–F zaimplementowane, oczekuje na konfigurację GitHub i push
**Cel:** powtarzalne, bezpieczne przejście kodu i zmian bazy przez DEV → UAT → PROD.

## 1. Docelowa architektura środowisk

| Środowisko | Branch | Frontend | Supabase | Stan |
|---|---|---|---|---|
| DEV | `main` | lokalny Codex / Vite | `xiqhaiyieisgemqopxfw` | aktywne środowisko rozwoju |
| UAT | `uat` | Vercel `podrozowka-uat` | `nqqephusxnxzzkfulfae` | gotowe do testów akceptacyjnych |
| PROD | `production` | Vercel `podrozowka-prod`, `podrozowka.pl` | `iyxbgyfuudwcrirlbmhb` | nie wdrażać przed akceptacją UAT |

> Aktualizacja względem poprzedniego planu: Google AI Studio nie jest już narzędziem DEV. Rozwój prowadzimy lokalnie w Codex, a `main` pozostaje główną gałęzią rozwoju.

## 2. Zrealizowane

### Architektura i Git

- [x] Jedno repozytorium `KDZFoundation/Podrozowka` z branchami `main`, `uat`, `production`.
- [x] `main` jest środowiskiem DEV.
- [x] Aktualny kod DEV został scalony do `uat`.
- [x] Vercel UAT jest połączony z branchem `uat`.
- [x] Vercel PROD istnieje i jest powiązany z branchem `production`.

### Quality Gate

- [x] Workflow `.github/workflows/quality.yml` działa dla pushy i PR-ów na `main`, `uat`, `production`.
- [x] Gate wykonuje: `npm ci`, TypeScript, ESLint, testy i build właściwy dla środowiska.
- [x] Skrypty `build:dev`, `build:uat`, `build:prod` istnieją.
- [x] Na aktualnym kodzie UAT lokalnie przeszły: typecheck, testy i build.

### Baza danych i baseline

- [x] DEV został przyjęty jako źródło prawdy schematu.
- [x] Utworzono jeden kanoniczny baseline `supabase/migrations/20260807120000_dev_public_baseline.sql`.
- [x] Stare migracje przeniesiono do `supabase/migrations-archive/`.
- [x] Seed 228 krajów znajduje się osobno w `supabase/seed.sql` i jest idempotentny.
- [x] Baseline przetestowano na pustym lokalnym PostgreSQL Supabase w Dockerze.
- [x] Baseline i seed wdrożono na Supabase UAT.
- [x] Audyt po wdrożeniu UAT potwierdził 22 tabele, 45 polityk RLS i 34 triggery.

### Edge Functions i UAT runtime

- [x] Wdrożono 10 Edge Functions do UAT.
- [x] Sprawdzono dostępność wszystkich funkcji przez preflight CORS (`OPTIONS 200`).
- [x] Ustawiono publiczne zmienne Vercel dla UAT.
- [x] Ustawiono sekrety UAT: `SITE_URL`, `FISCAL_ENABLED=false`, osobny sekret wewnętrzny.
- [x] Utworzono bezpieczny lokalny skrypt `scripts/deploy-uat-functions.ps1`; token jest podawany lokalnie i nie trafia do repozytorium.

### UAT frontend smoke test

- [x] UAT odpowiada publicznie przez HTTPS.
- [x] Dodano `vercel.json`, aby bezpośrednie wejście na trasy SPA nie zwracało 404.
- [x] Zweryfikowano odpowiedź `200` dla `/`, `/sklep`, `/koszyk`, `/checkout` i `/auth`.

### Etap A — Database Gate (ukończony)

- [x] Skrypt `scripts/database-gate.sh` naprawiony: połączenie przez socket UNIX `/var/run/postgresql` z fallbackiem na TCP po 30 próbach; `POSTGRES_HOST_AUTH_METHOD=trust`; diagnostyka `docker logs` przy awarii.
- [x] Workflow `.github/workflows/database-gate.yml` ulepszony: path filter (`supabase/migrations/**`, `supabase/seed.sql`, `scripts/database-gate.sh`), krok diagnostyczny na failure, timeout 10 min.
- [ ] **MANUAL:** push na `main`, zweryfikować pierwszy zielony przebieg w GitHub Actions.
- [ ] **MANUAL:** oznaczyć Database Gate jako wymagany check po potwierdzeniu zielonego przebiegu.

### Etap B — Edge Functions Gate (ukończony)

- [x] Utworzono nowy workflow `.github/workflows/edge-functions-gate.yml`.
- [x] Detekcja zmienionych funkcji przez `git diff` (ignoruje `_shared/`).
- [x] Selektywny deploy tylko zmienionych funkcji do UAT lub PROD.
- [x] Mapowanie JWT spójne z `supabase/config.toml`:
  - Bez JWT (`--no-verify-jwt`): `register-postcard`, `generate-qr`, `generate-qr-pdf`, `p24-webhook`, `issue-fiscal-document`, `fiscal-document-pdf`, `create-payment`.
  - Z JWT: `confirm-cod-payment`, `create-inpost-shipment`, `admin-payment-status`.
- [x] Health-check OPTIONS po każdym deployu.
- [x] GitHub Environment `production` wymaga manualnego zatwierdzenia.
- [ ] **MANUAL:** dodać GitHub Secrets `SUPABASE_ACCESS_TOKEN_UAT` i `SUPABASE_ACCESS_TOKEN_PROD` w Settings → Secrets → Actions.
- [ ] **MANUAL:** utworzyć GitHub Environment `production` z wymaganym reviewerem.

### Etap C — Branch Protection (dokumentacja gotowa)

- [x] Utworzono szczegółową instrukcję `docs/BRANCH_PROTECTION_GUIDE.md` z krokami konfiguracji dla `uat` i `production`.
- [ ] **MANUAL:** skonfigurować Branch Protection wg instrukcji w GitHub UI.

### Etap D — testy automatyczne (ukończony)

- [x] 39 testów przechodzi (`npm run test`), w tym:
  - `src/__tests__/cart.test.tsx` — 15 testów CartContext (add, remove, setQuantity, clear, totalCount, getQuantity, maxQuantity, localStorage persistence).
  - `src/__tests__/checkout.test.ts` — 17 testów walidacji (adres kurierski, kod pocztowy, telefon, koszty dostawy, `isCourierAddressValid`, `emptyCourierAddress`).
  - `src/__tests__/routing.test.tsx` — 2 testy routingu (NotFound/404).
  - `src/__tests__/checkout-context.test.tsx` — 4 testy CheckoutContext (pickup point, sessionStorage).
  - `src/test/example.test.ts` — 1 istniejący test placeholder.
- [x] TypeScript typecheck przechodzi bez błędów.
- [x] ESLint: 0 błędów, 11 istniejących ostrzeżeń (nie wprowadzono nowych).
- [ ] Testy Edge Functions (autoryzacja, webhook, idempotencja) — wymagają Supabase runtime / Deno, do wdrożenia w osobnym etapie.
- [ ] Testy RLS (anonim, podróżnik, administrator) — wymagają izolowanego Dockera Supabase, do wdrożenia w osobnym etapie.
- [ ] Test generowania QR i PDF SRA3 — wymaga ReportLab / specyficznych zależności, do wdrożenia w osobnym etapie.

### Etap E — smoke test UAT (ukończony)

- [x] Utworzono skrypt `scripts/uat-smoke-test.sh` — sprawdza 5 tras frontendowych (HTTP 200) i 10 Edge Functions (OPTIONS preflight), drukuje sformatowane podsumowanie.
- [ ] **MANUAL:** uruchomić skrypt po konfiguracji UAT: `bash scripts/uat-smoke-test.sh`.

### Etap F — przygotowanie produkcji (ukończony)

- [x] Utworzono skrypt `scripts/deploy-prod-functions.ps1` — analogiczny do UAT, wskazuje na PROD (`iyxbgyfuudwcrirlbmhb`), z dodatkowym potwierdzeniem przed wdrożeniem.
- [x] Utworzono checklist `docs/PROD_DEPLOYMENT_CHECKLIST.md` — pre-deploy, konfiguracja, wdrożenie, weryfikacja, rollback.
- [ ] **MANUAL:** konfiguracja Vercel PROD i Supabase PROD (zmienne, sekrety).
- [ ] **MANUAL:** sandbox Przelewy24 i InPost (wg `docs/INPOST_SANDBOX_PLAN.md`).
- [ ] **MANUAL:** po akceptacji UAT → merge `uat` → `production` i wdrożenie `podrozowka.pl`.

## 3. Kolejność uruchomienia po pushu

Po zapisaniu tych zmian i wypchnięciu na `main`, Codex / GitHub Actions powinny automatycznie uruchomić:

1. **Quality Gate** (`quality.yml`) — zawsze przy push/PR na `main`, `uat`, `production`.
2. **Database Gate** (`database-gate.yml`) — tylko przy zmianach w `supabase/migrations/**`, `supabase/seed.sql` lub `scripts/database-gate.sh`.
3. **Edge Functions Gate** (`edge-functions-gate.yml`) — tylko przy zmianach w `supabase/functions/**`.

### Mapa plików workflow

| Workflow | Plik | Trigger |
|---|---|---|
| Quality Gate | `.github/workflows/quality.yml` | push/PR na `main`, `uat`, `production` |
| Database Gate | `.github/workflows/database-gate.yml` | push/PR + zmiany w migracjach/seed |
| Edge Functions Gate | `.github/workflows/edge-functions-gate.yml` | push/PR + zmiany w `supabase/functions/**` |

### Mapa skryptów

| Skrypt | Cel | Środowisko |
|---|---|---|
| `scripts/database-gate.sh` | Izolowany test migracji w Dockerze | CI (GitHub Actions) |
| `scripts/deploy-uat-functions.ps1` | Deploy Edge Functions na UAT | lokalne (PowerShell) |
| `scripts/deploy-prod-functions.ps1` | Deploy Edge Functions na PROD | lokalne (PowerShell) |
| `scripts/uat-smoke-test.sh` | Smoke test UAT (frontend + Edge Functions) | lokalne (bash) |

### Mapa dokumentacji

| Dokument | Opis |
|---|---|
| `docs/BRANCH_PROTECTION_GUIDE.md` | Instrukcja konfiguracji Branch Protection |
| `docs/PROD_DEPLOYMENT_CHECKLIST.md` | Checklist wdrożenia produkcyjnego |
| `docs/UAT_RUNTIME_CONFIGURATION.md` | Konfiguracja runtime UAT |
| `docs/INPOST_SANDBOX_PLAN.md` | Plan integracji InPost sandbox |

## 4. Elementy odłożone

- [ ] CodeQL.
- [ ] Dependabot.
- [ ] SonarCloud.
- [ ] Lighthouse CI i monitoring jakości.
- [ ] Testy Edge Functions (autoryzacja, webhook, idempotencja).
- [ ] Testy RLS (anonim, podróżnik, administrator, izolacja).
- [ ] Test generowania QR i PDF SRA3.

## 5. Zasady bezpieczeństwa

- Żaden token, klucz P24, ShipX, Merit ani `service_role` nie trafia do Git, Vercel frontend ani dokumentacji.
- Sekret pokazany podczas wdrożenia funkcji UAT należy usunąć po użyciu z panelu Supabase.
- Zmiany struktury bazy powstają wyłącznie jako nowe migracje przyrostowe; nie modyfikujemy wdrożonego baseline'u.
- PROD wdrażamy wyłącznie po przejściu UAT i ręcznym zatwierdzeniu release'u.
- Tokeny Supabase CLI przechowywane wyłącznie jako GitHub Secrets (`SUPABASE_ACCESS_TOKEN_UAT`, `SUPABASE_ACCESS_TOKEN_PROD`).
