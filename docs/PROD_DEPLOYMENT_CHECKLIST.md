# Checklist wdrożenia produkcyjnego — Podróżówka

Poniższa lista kontrolna służy jako przewodnik podczas wdrażania nowej wersji aplikacji na środowisko produkcyjne (PROD). Zapewnia spójność i minimalizuje ryzyko awarii.

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
