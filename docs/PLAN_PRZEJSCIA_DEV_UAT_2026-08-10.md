# Audyt platformy i plan przejścia DEV → UAT

**Data audytu:** 10.08.2026  
**Repozytorium:** `KDZFoundation/Podrozowka`  
**DEV:** branch `main`, Supabase `xiqhaiyieisgemqopxfw`  
**UAT:** branch `uat`, Supabase `nqqephusxnxzzkfulfae`, Vercel `podrozowka-uat-one.vercel.app`  
**Decyzja:** **NIE PROMOWAĆ obecnego DEV do UAT przed zamknięciem P0.**

## 1. Podsumowanie wykonanych kontroli

| Kontrola | Wynik | Uwagi |
|---|---|---|
| TypeScript | PASS | `npm run typecheck` |
| ESLint | PASS z ostrzeżeniami | 0 błędów, 11 ostrzeżeń |
| Testy jednostkowe | PASS | 39/39 testów, 5 plików |
| Build UAT | PASS | `npm run build:uat` |
| Git diff check | PASS | brak błędów whitespace |
| Stan roboczy | BLOCKER | wiele niezatwierdzonych zmian i nowych plików |
| Migracje UAT | BLOCKER | migracja `authors` nie ma potwierdzonego wdrożenia na UAT |
| Database Gate po `authors` | BLOCKER | skrypt oczekuje dokładnie 22 tabel z RLS, po migracji będzie 23 |
| CORS UAT | BLOCKER | domena `podrozowka-uat-one.vercel.app` nie jest dozwolona |
| Role administratora | BLOCKER | frontend zawiera hardkodowane adresy e-mail administratorów |
| Spójność branchy | BLOCKER | `main` i `uat` mają rozbieżne historie; lokalnie `main...uat = 8/9` |

## 2. Co jest gotowe

- aplikacja kompiluje się w trybie UAT;
- istnieją trzy bramki CI: Quality, Database i Edge Functions;
- istnieje kanoniczny baseline bazy i idempotentny seed krajów;
- istnieją skrypty wdrażania funkcji UAT oraz smoke test UAT;
- routing SPA na Vercel ma rewrite;
- sklep, koszyk, checkout, panel podróżnika, panel administratora, QR/POD i grywalizacja są zaimplementowane;
- rangi dashboardu pobierają konfigurację z `gamification_tiers`;
- migracja kartoteki autorów jest przygotowana i według wcześniejszej weryfikacji działa na DEV;
- frontend nie wymaga PostHog ani innych dodatkowych integracji do przejścia na UAT.

## 3. P0 — blokery przed utworzeniem PR `main` → `uat`

### P0.1. Uporządkować pakiet zmian DEV

Zakres roboczy obejmuje jednocześnie: autorów, PDF, landing/marketing, aktywację QR, analitykę lokalną i grywalizację. Przed promocją:

- przejrzeć pełny diff;
- potwierdzić, że nie ma zmian przypadkowych;
- usunąć lub wyłączyć kod eksperymentalny niewymagany w UAT;
- wykonać jeden kontrolowany commit release candidate albo kilka logicznych commitów;
- nie dołączać `dist`, lokalnych plików `.env`, tokenów ani danych użytkowników.

**Akceptacja:** `git status` jest czysty po zatwierdzeniu uzgodnionego zakresu.

### P0.2. Naprawić CORS Edge Functions

`supabase/functions/_shared/cors.ts` nie dopuszcza domeny UAT Vercel. Dodać dokładnie:

- `https://podrozowka-uat-one.vercel.app`;
- docelową domenę PROD pozostawić oddzielnie;
- nie stosować szerokiego wildcardu `*.vercel.app` dla produkcji.

Obecny Edge Functions Gate ignoruje samodzielne zmiany w `_shared`. Zmiana pliku wspólnego musi powodować ponowne wdrożenie wszystkich funkcji, które go importują.

**Akceptacja:** żądania z origin UAT otrzymują właściwy `Access-Control-Allow-Origin`, a rzeczywisty POST/GET działa w przeglądarce — nie tylko `OPTIONS` bez originu.

### P0.3. Naprawić Database Gate dla migracji przyrostowych

Migracja `20260810150000_authors.sql` dodaje tabelę z RLS. Skrypt `database-gate.sh` oczekuje dokładnie 22 tabel z RLS, więc po poprawnej migracji zwróci fałszywy błąd.

- zmienić asercję z dokładnej liczby na listę wymaganych tabel lub wartość minimalną;
- dodać `authors` do listy wymaganych tabel;
- sprawdzić tabelę, `card_designs.author_id`, FK `ON DELETE SET NULL`, indeksy, trigger i politykę administratora;
- uruchomić bramkę na czystej bazie.

**Akceptacja:** baseline + `authors` + seed przechodzą na pustym PostgreSQL/Supabase.

### P0.4. Usunąć hardkodowane uprawnienia administratora

`src/hooks/useAuth.tsx` nadaje rolę administratora na podstawie dwóch adresów e-mail. Jest to niespójne z RLS i nie powinno przejść na UAT.

- jedynym źródłem roli ma być `public.user_roles` / bezpieczna funkcja `has_role`;
- utworzyć konto administratora UAT i nadać rolę wyłącznie w bazie UAT;
- zweryfikować odmowę dostępu dla zwykłego podróżnika.

**Akceptacja:** adres e-mail nie wpływa na `isAdmin`; użytkownik bez roli nie otworzy panelu admina ani nie wykona operacji administracyjnej.

### P0.5. Ustalić linię promocji branchy

`main` i `uat` nie są liniowym fast-forwardem. Nie wykonywać ślepego nadpisania brancha.

- pobrać aktualne branche z origin;
- porównać unikalne commity;
- zachować zmiany CI/CD istniejące na `uat`;
- utworzyć PR `main` → `uat` i rozwiązać konflikty jawnie;
- przed merge wymagać zielonych: Quality Gate, Database Gate i Edge Functions Gate.

**Akceptacja:** PR pokazuje tylko oczekiwany release DEV, bez utraty zmian UAT.

### P0.6. Zastosować migrację na UAT i potwierdzić stan żywej bazy

Stan repozytorium nie jest równoznaczny ze stanem Supabase UAT.

- wykonać `supabase db push` dla projektu `nqqephusxnxzzkfulfae` dopiero po zielonym Database Gate;
- nie seedować danych produkcyjnych ani PII;
- sprawdzić `authors`, `card_designs.author_id`, `gamification_tiers`, polityki RLS i triggery;
- zapisać output wdrożenia i wynik zapytań kontrolnych.

**Akceptacja:** migracja widnieje w historii UAT i wszystkie obiekty istnieją na żywej bazie.

## 4. P1 — obowiązkowe testy akceptacyjne UAT

### P1.1. Konfiguracja runtime

Zweryfikować w Vercel UAT:

- `VITE_APP_ENV=uat`;
- `VITE_SUPABASE_PROJECT_ID=nqqephusxnxzzkfulfae`;
- `VITE_SUPABASE_URL=https://nqqephusxnxzzkfulfae.supabase.co`;
- `VITE_SUPABASE_PUBLISHABLE_KEY` należy do UAT;
- `VITE_PUBLIC_APP_URL=https://podrozowka-uat-one.vercel.app`;
- brak sekretów serwerowych w Vercel frontend.

Poprawić niespójność w `quality.yml`: workflow używa `VITE_SUPABASE_ANON_KEY`, a aplikacja używa `VITE_SUPABASE_PUBLISHABLE_KEY`.

Zweryfikować w Supabase UAT:

- `SITE_URL` wskazuje UAT;
- Google OAuth jest włączony;
- Site URL i Redirect URLs zawierają domenę UAT oraz właściwe callbacki;
- `FISCAL_ENABLED=false`;
- klucze P24 i InPost są wyłącznie sandboxowe;
- `INTERNAL_FN_SECRET` jest osobny dla UAT.

### P1.2. Dane testowe UAT

Seed repozytorium tworzy kraje, ale nie gwarantuje pełnego katalogu sklepu. Przygotować jawny, idempotentny zestaw UAT bez PII:

- minimum 2 aktywne kraje;
- minimum 2 kategorie;
- minimum 2 wzory i produkty z ceną 4,99 zł;
- szablony językowe, w tym jeden język niepolski;
- 1 autor testowy ze statusem umowy `signed`;
- rangi: 0 / 500 / 1500 / 3000 / 7500;
- osobne konta: administrator UAT, podróżnik UAT, obdarowany anonimowy.

### P1.3. Pełna ścieżka biznesowa

Wykonać test na UAT w tej kolejności:

1. logowanie Google i e-mail jako podróżnik;
2. sklep → różne wzory → koszyk minimum 10 sztuk;
3. checkout z paczkomatem i kurierem;
4. płatność sandbox lub kontrolowany tryb testowy;
5. zamówienie widoczne u podróżnika i administratora;
6. przygotowanie zadania POD po płatności;
7. unikalny QR dla każdej sztuki;
8. pobranie PDF SRA3: 8 kartek, spad 3 mm, bezpieczny margines 10 mm, flip short edge;
9. skan QR telefonem na publicznej domenie UAT;
10. formularz obdarowanego w języku kartki;
11. rejestracja relacji dokładnie jeden raz;
12. aktualizacja statusu, punktów, rangi, misji i Wpływu Kulturowego;
13. ponowny skan pokazuje stan „już zarejestrowana” bez duplikatu.

### P1.4. Role i RLS

Minimalny zestaw testów integracyjnych:

- anonim widzi tylko publiczny katalog i publiczny formularz QR;
- podróżnik widzi wyłącznie własne zamówienia, kartki i relacje;
- podróżnik nie może zapisywać `authors`, rang ani danych innych osób;
- administrator może zarządzać słownikami i POD;
- e-mail obdarowanego pozostaje zamaskowany bez `contact_opt_in`;
- publiczny token QR nie ujawnia danych podróżnika poza zakresem formularza.

### P1.5. Edge Functions

Obecny health-check OPTIONS potwierdza tylko dostępność endpointu. Dodać testy rzeczywistych odpowiedzi:

- `register-postcard`: poprawny, błędny i użyty token;
- `create-payment`: brak sesji, koszyk <10, koszyk poprawny, powtórzenie requestu;
- `p24-webhook`: błędny podpis, poprawny podpis, ponowienie webhooka;
- `generate-qr` / `generate-qr-pdf`: brak roli admina i poprawny admin;
- funkcje administracyjne: JWT użytkownika bez roli zwraca 403;
- funkcje wewnętrzne: błędny `INTERNAL_FN_SECRET` zwraca 401/403.

### P1.6. UX, treści i dostępność

- test desktop oraz telefon dla landing, sklepu, koszyka, checkoutu, dashboardu, admina i QR;
- sprawdzić focus, klawiaturę, kontrast, etykiety formularzy i komunikaty błędów;
- usunąć stare adresy `podrozowka.lovable.app` z canonical/OG i fallbacków;
- naprawić ostrzeżenie hooka w `RegisterPostcard.tsx`;
- zweryfikować wszystkie teksty polskie i języki obdarowanych;
- potwierdzić dane administratora, regulamin, politykę prywatności i zgodę kontaktową.

## 5. P2 — zalecane przed akceptacją końcową UAT

- dodać automatyczny test PDF/QR porównujący geometrię i obecność unikalnych kodów;
- dodać testy grywalizacji dla progów 499/500, 1499/1500, 2999/3000, 7499/7500;
- poprawić bundle: główny JS ma około 2,29 MB, gzip około 671 kB;
- zoptymalizować obrazy landing page (część ma 1,6–2,0 MB);
- usunąć lub odizolować rozbudowaną emulację Edge Functions z produkcyjnego klienta Supabase;
- zaktualizować `caniuse-lite` i zaplanować migrację ostrzeżeń React Router;
- uzupełnić automatyczne testy smoke o `/dashboard`, `/admin` i publiczną trasę `/r/:token`;
- opisać rollback UAT: poprzedni deployment Vercel, zgodność migracji i Edge Functions.

## 6. GitHub i automatyzacja

- potwierdzić, że sekrety `SUPABASE_ACCESS_TOKEN_UAT` są skonfigurowane;
- nie wymagać sekretu PROD do samego przejścia DEV → UAT, ale workflow nie może próbować wdrażać PROD;
- zmiana `_shared` ma wdrażać wszystkie zależne Edge Functions;
- wymagane checki na PR do `uat`: Quality Gate, Database Gate, Edge Functions Gate;
- GitHub Rulesets na prywatnym repo Hobby nie są egzekwowane — do czasu zmiany planu stosować obowiązkowy PR i ręczną checklistę właściciela;
- nie używać bezpośredniego push do `uat` dla release candidate.

## 7. Kolejność wykonania release candidate

1. Naprawy P0 w `main`.
2. Lokalnie: typecheck, lint, test, build UAT, Database Gate.
3. Commit i push `main`.
4. Zielone GitHub Actions na `main`.
5. PR `main` → `uat`, jawne rozwiązanie rozbieżności historii.
6. Zielone wszystkie checki PR.
7. Merge do `uat`.
8. Wdrożenie migracji UAT i zapis outputu.
9. Deploy zmienionych Edge Functions UAT.
10. Redeploy Vercel UAT.
11. Smoke test techniczny.
12. Pełny test biznesowy i podpisanie protokołu UAT.

## 8. Kryterium GO / NO-GO

### GO

- wszystkie P0 zamknięte;
- Quality, Database i Edge Functions Gate są zielone;
- migracje i funkcje są potwierdzone na żywym UAT;
- pełna ścieżka zakup → QR → PDF → rejestracja → grywalizacja przechodzi;
- nie występuje dostęp do cudzych danych ani panelu administratora;
- krytyczne błędy UAT = 0.

### NO-GO

- jakakolwiek funkcja używa bazy DEV z domeny UAT;
- CORS blokuje rzeczywiste wywołania;
- rola admina zależy od e-maila w frontendzie;
- migracje nie przechodzą na pustej bazie lub nie są zastosowane na UAT;
- płatność może utworzyć duplikat albo PDF/QR nie odpowiada zamówieniu;
- istnieje możliwość odczytu danych innego podróżnika lub obdarowanego.

## 9. Stan migracji `authors`

- **Repozytorium:** migracja jest przygotowana jako `supabase/migrations/20260810150000_authors.sql`.
- **DEV:** według wcześniejszej ręcznej weryfikacji moduł działał na żywej bazie DEV.
- **UAT:** brak potwierdzenia zastosowania podczas tego audytu.
- **Wymaganie:** zastosować dopiero po naprawie i przejściu Database Gate, następnie zweryfikować na żywej bazie UAT.

