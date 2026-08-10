# Konfiguracja Branch Protection — Podróżówka

Niniejszy dokument opisuje kroki niezbędne do konfiguracji reguł ochrony gałęzi (Branch Protection) dla repozytorium projektu Podróżówka.

## Wymagania wstępne
- Dostęp z uprawnieniami administratora (Admin) do repozytorium GitHub projektu.
- Skonfigurowane środowiska (Environments) w ustawieniach repozytorium.

## Konfiguracja gałęzi `uat`
Gałąź `uat` służy do testów akceptacyjnych. Nie powinna być bezpośrednio modyfikowana.

1. Przejdź do **Settings** -> **Branches** w swoim repozytorium GitHub.
2. Kliknij **Add branch protection rule**.
3. W polu **Branch name pattern** wpisz: `uat`
4. Zaznacz **Require a pull request before merging**:
   - (Opcjonalnie) Zaznacz **Require approvals** i ustaw wymaganą liczbę reviewerów (może być 0, jeśli review jest opcjonalne, ale proces wymaga PR).
5. Zaznacz **Require status checks to pass before merging**:
   - Włącz **Require branches to be up to date before merging**.
   - Dodaj następujące status checks (wymaga wcześniejszego uruchomienia GitHub Actions dla tych zadań):
     - `Quality Gate`
     - `Database Gate` (weryfikacja na podstawie ścieżek `supabase/migrations/**`)
     - `Edge Functions Gate` (weryfikacja na podstawie ścieżek `supabase/functions/**`)
6. (Opcjonalnie) Zaznacz **Do not allow bypassing the above settings** dla administratorów.
7. Zaznacz **Restrict direct pushes** lub po prostu upewnij się, że bez PR nikt nie może wrzucać zmian (zapobiega bezpośrednim pushom).
8. Zaznacz **Block force pushes** oraz **Block deletions**.
9. Kliknij **Create** (lub Save changes).

## Konfiguracja gałęzi `production`
Gałąź `production` odzwierciedla środowisko produkcyjne i ma najbardziej restrykcyjne reguły.

1. W **Settings** -> **Branches**, kliknij **Add branch protection rule**.
2. W polu **Branch name pattern** wpisz: `production`
3. Zaznacz **Require a pull request before merging**:
   - Zaznacz **Require approvals** i ustaw minimum **1 reviewer**.
4. Zaznacz **Require status checks to pass before merging**:
   - Włącz **Require branches to be up to date before merging**.
   - Dodaj obowiązkowe checks:
     - `Quality Gate`
     - `Database Gate`
     - `Edge Functions Gate`
5. Zaznacz **Require conversation resolution before merging** (wszystkie komentarze muszą zostać rozwiązane przed merge'em).
6. Upewnij się, że zaznaczone są **Block force pushes** oraz **Block deletions**. Restrict direct pushes (brak bezpośrednich pushy).
7. Kliknij **Create** (lub Save changes).

## Konfiguracja GitHub Environment `production`
Środowiska w GitHub pozwalają na dodanie dodatkowego kroku autoryzacji przed wdrożeniem (np. poprzez GitHub Actions).

1. Przejdź do **Settings** -> **Environments** w repozytorium.
2. Kliknij **New environment**.
3. Nazwij środowisko: `production`
4. W sekcji **Environment protection rules**:
   - Zaznacz **Required reviewers** i dodaj osoby, które muszą zatwierdzić wdrożenie produkcyjne.
5. W sekcji **Deployment branches and tags**:
   - W opcji **Selected branches** dodaj regułę dopuszczającą tylko gałąź `production`.
6. Zapisz środowisko.

## Weryfikacja
Jak upewnić się, że Branch Protection działa:
1. Spróbuj zrobić bezpośredni git push (np. `git push origin uat` z nowymi zmianami) ze swojego lokalnego terminala. Powinno zostać odrzucone z błędem informującym o regułach ochrony.
2. Utwórz Pull Request na gałąź `uat` lub `production`. Sprawdź, czy na dole PR widnieje lista wymaganych status checks, a merge jest zablokowany dopóki się nie zakończą.
3. W przypadku PR na `production`, sprawdź czy wymagane jest zatwierdzenie przez reviewera i rozwiązanie komentarzy przed uaktywnieniem przycisku Merge.
