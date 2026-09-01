# Checklist wdrożenia produkcyjnego — Podróżówka

Poniższa lista kontrolna służy jako przewodnik podczas wdrażania nowej wersji aplikacji na środowisko produkcyjne (PROD). Zapewnia spójność i minimalizuje ryzyko awarii.

## 1. Bloker przed uruchomieniem produkcji — izolacja PROD

Ten etap wykonujemy po akceptacji UAT (w tym fizycznej próbie impozycji SRA3), a przed uruchomieniem sprzedaży na `podrozowka.pl`.

- [ ] Utworzyć i skonfigurować odrębne środowisko Firebase/Firestore oraz Cloud Storage dla PROD; nie wskazywać bazy UAT.
- [ ] Utworzyć chroniony workflow `deploy-prod.yml`, uruchamiany wyłącznie z gałęzi lub tagu produkcyjnego i wymagający ręcznej akceptacji.
- [ ] Wybrać jeden backend API dla PROD (Vercel albo Cloud Run) i ustawić go konsekwentnie w deployu, rewrites oraz `VITE_BACKEND_API_URL`.
- [ ] Skonfigurować produkcyjne sekrety: HotPay, InPost, `FRONTEND_ORIGIN`, `PUBLIC_APP_URL`, dostęp backendu do Firestore i GCS oraz — jeśli używany — Resend.
- [ ] Zweryfikować komplet danych katalogowych i mediów w Firestore/Storage PROD.
- [ ] Wykonać eksport archiwalny Supabase, odłączyć historyczne ścieżki Supabase/P24 i potwierdzić, że aktywne widoki ich nie używają.
- [ ] Wykonać jedno kontrolowane zamówienie PROD: HotPay → webhook → POD → PDF → InPost → rejestracja QR.
- [ ] Skonfigurować DNS/SSL, Firebase Auth Authorized Domains, backup Firestore/Storage, monitoring oraz procedurę rollbacku.

## Na później — asystent operatorski Codex

- [ ] Rozważyć wewnętrznego asystenta operatorskiego opartego o AI SDK Codex Harness — wyłącznie do zadań pomocniczych/read-only (np. analiza logów, raporty testów i diagnostyka batchów).
- [ ] Nie używać agenta AI do deterministycznego planowania impozycji, płatności, HotPay, InPost, zapisu do Firestore ani automatycznego wydania do drukarni.
- [ ] Przed ewentualnym wdrożeniem osobno ocenić Vercel Sandbox, koszty, poświadczenia OpenAI/AI Gateway i model potwierdzeń operatora; integracja jest eksperymentalna.

## 2. Pre-deploy checks:
- [ ] `uat` zaakceptowane przez zespół
- [ ] Wszystkie testy przechodzą na `uat`
- [ ] Quality Gate zielony
- [ ] Database Gate zielony
- [ ] Edge Functions Gate zielony

## 3. Konfiguracja PROD:
- [ ] Audyt zmiennych Vercel PROD (sprawdzić zgodność z listą zmiennych z `UAT_RUNTIME_CONFIGURATION.md`, ale zastosowaną dla PROD ref `iyxbgyfuudwcrirlbmhb`)
- [ ] Ustawienie sekretów Supabase PROD (zmienne np. `SITE_URL`, `FISCAL_ENABLED`, `INTERNAL_FN_SECRET`, `P24_*`, `INPOST_*`)
- [ ] **NIE** kopiować sekretów z DEV/UAT

## 4. Wdrożenie:
- [ ] Backup bazy PROD przed migracją
- [ ] Zastosowanie migracji na PROD
- [ ] Deploy Edge Functions (uruchom skrypt: `scripts/deploy-prod-functions.ps1`)
- [ ] Merge `uat` → `production`
- [ ] Vercel auto-deploy z brancha `production`

## 5. Weryfikacja po wdrożeniu:
- [ ] Smoke test: `/`, `/sklep`, `/koszyk`, `/checkout`, `/auth` zwracają status HTTP 200
- [ ] Health-check Edge Functions (test `OPTIONS` zwraca 200/204)
- [ ] Test logowania i rejestracji
- [ ] Sprawdzenie logów Supabase (brak błędów 500)
- [ ] Sprawdzenie logów Vercel (brak krytycznych błędów)
- [ ] Sprawdzenie czy DNS `podrozowka.pl` prawidłowo kieruje na Vercel PROD

## 6. Rollback plan:
W przypadku krytycznego błędu na produkcji należy wykonać następujące kroki:
- [ ] Revert merge na `production` (powrót do poprzedniego commita)
- [ ] Restore backup bazy danych (przywrócenie stanu sprzed wdrożenia)
- [ ] Redeploy poprzedniej wersji Edge Functions
