# Rekonsyliacja baseline migracji

## Status

**Stan na 2026-08-07: canonical baseline przeszedł test na pustym lokalnym
PostgreSQL Supabase. Nie został jeszcze wdrożony na UAT ani produkcji.**

Środowisko DEV (`xiqhaiyieisgemqopxfw`) jest źródłem prawdy dla schematu.
Historia `supabase_migrations.schema_migrations` na DEV kończy się na
`20260806060000`, lecz w samym schemacie istnieją również zmiany z kolejnych
migracji (POD, kody QR, ochrona krajów i `countries.flag_url`). Oznacza to,
że część zmian wykonano poza śledzoną historią CLI.

## Czego nie wolno robić

- Nie uruchamiać obecnego katalogu `supabase/migrations` od zera na UAT/PROD.
- Nie używać plików `20260121122931_consolidated_baseline.sql` oraz
  `20260804155100_reconciled_baseline_snapshot.sql` jednocześnie jako dwóch
  baseline'ów.
- Nie wykonywać `supabase db push` na UAT ani produkcji przed utworzeniem
  zweryfikowanego baseline'u.

## Canonical baseline

Eksport `baselines/DEV_PUBLIC_SCHEMA_FROM_REMOTE.sql` jest surowym zrzutem
samego schematu `public` z DEV. `baselines/DEV_PUBLIC_SCHEMA_BASELINE.sql`
jest jego wersją gotową do testu: bez poleceń właścicieli obiektów i bez
ustawień sesji `pg_dump`. Nie zawiera danych biznesowych, kont użytkowników,
zamówień, kodów QR ani danych testowych.

Zakres wymagany w baseline:

1. pełny schemat z `20260804155100_reconciled_baseline_snapshot.sql`;
2. `20260804155900_add_registered_country_to_recipient_registrations.sql`;
3. `20260805031500_card_creator_and_language_templates.sql`;
4. `20260805040000_fix_create_order_16_params.sql`;
5. `20260806020000_add_fiscal_document_columns_to_orders.sql`;
6. `20260806040000_add_inpost_columns_to_shipments.sql`;
7. `20260806060000_cascade_card_designs_deletion.sql`;
8. `20260806190000_pod_orders_without_inventory.sql`;
9. `20260806220000_prepare_pod_qr_after_payment.sql`;
10. `20260807090000_protect_countries_used_by_designs.sql`;
11. `20260807100000_add_country_flag_url.sql`.

`20260805032500_seed_all_world_countries.sql` należy zastąpić kontrolowanym
seedem uruchamianym osobno, a nie niezmiennym elementem schematu. Pozwala to
przenosić strukturę między DEV, UAT i PROD bez nadpisywania słowników.

## Procedura wykonania

1. Wykonano bezpieczny eksport wyłącznie schematu `public` z DEV.
2. Porównać canonical baseline z DEV: tabele, kolumny, funkcje RPC, triggery,
   polityki RLS, indeksy i klucze obce.
3. Wykonano test na pustym lokalnym PostgreSQL Supabase: utworzono 22 tabele,
   33 funkcje, 45 polityk i 34 triggery — bez błędów.
4. Utworzono jeden nowy baseline w `supabase/migrations`; poprzednie 15 plików
   są w `supabase/migrations-archive` jako archiwum tylko do odczytu.
   Słownik 228 krajów jest osobnym, idempotentnym seedem `supabase/seed.sql`.
5. Dopiero wtedy ustalić historię migracji DEV, następnie zastosować ten sam
   baseline na UAT, a po akceptacji na PROD.
6. Wszystkie następne zmiany muszą być wyłącznie migracjami przyrostowymi.

## Bramka wdrożeniowa

Do czasu zakończenia kroków 1–4 obowiązuje blokada wdrażania zmian bazy i
funkcji Supabase z gałęzi `uat` oraz `production`. Można nadal wdrażać sam
frontend, o ile nie wymaga on nowej migracji ani zmienionej funkcji Edge.

## Audyt UAT — 2026-08-07

Projekt UAT (`nqqephusxnxzzkfulfae`) nie zawiera tabel, widoków, polityk RLS
ani triggerów aplikacji Podróżówka. Jedynym obiektem `public` jest
`rls_auto_enable`, mechanizm platformy Supabase automatycznie włączający RLS
dla nowych tabel. Nie jest to konflikt z baseline'em.

**Wniosek:** UAT można zasilić canonical baseline'em i seedem krajów bez
resetowania projektu oraz bez usuwania danych biznesowych.

## Wdrożenie UAT — 2026-08-07

Canonical baseline `20260807120000_dev_public_baseline.sql` oraz
`supabase/seed.sql` zostały wdrożone przez `supabase db push`. Audyt po
wdrożeniu potwierdził zgodność z DEV:

- 22 tabele;
- 45 polityk RLS;
- 34 triggery;
- wszystkie funkcje aplikacji z DEV.

UAT ma dodatkowo `public.rls_auto_enable`, systemową funkcję Supabase
włączającą RLS na nowych tabelach. Jest oczekiwana i nie stanowi rozbieżności.
