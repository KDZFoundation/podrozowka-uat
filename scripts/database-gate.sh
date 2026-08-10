#!/usr/bin/env bash
set -euo pipefail

readonly POSTGRES_IMAGE="${POSTGRES_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.141}"
readonly POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
readonly CONTAINER_NAME="podrozowka-database-gate-${RANDOM}-${RANDOM}"
readonly DB_NAME="postgres"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

PG_HOST="/var/run/postgresql"

run_psql() {
  MSYS_NO_PATHCONV=1 docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONTAINER_NAME" \
    psql -h "$PG_HOST" -v ON_ERROR_STOP=1 -U postgres -d "$DB_NAME" "$@"
}

assert_equals() {
  local description="$1"
  local actual="$2"
  local expected="$3"

  if [[ "$actual" != "$expected" ]]; then
    echo "Database Gate failed: $description (expected: $expected, actual: $actual)" >&2
    exit 1
  fi

  echo "Verified: $description = $expected"
}

echo "Starting isolated PostgreSQL image: $POSTGRES_IMAGE"
docker run -d --name "$CONTAINER_NAME" \
  -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  -e POSTGRES_DB="$DB_NAME" \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  "$POSTGRES_IMAGE" >/dev/null

for attempt in {1..60}; do
  if [[ "$attempt" -gt 30 ]]; then
    PG_HOST="127.0.0.1"
  fi

  if run_psql -c 'select 1' >/dev/null 2>&1; then
    break
  fi

  if [[ "$attempt" == "60" ]]; then
    echo "Database Gate failed: PostgreSQL did not become ready in time." >&2
    docker logs "$CONTAINER_NAME"
    exit 1
  fi

  sleep 1
done

mapfile -t migrations < <(find supabase/migrations -maxdepth 1 -type f -name '*.sql' -print | sort)
if [[ "${#migrations[@]}" -eq 0 ]]; then
  echo 'Database Gate failed: no active SQL migrations found.' >&2
  exit 1
fi

for migration in "${migrations[@]}"; do
  echo "Applying migration: $migration"
  docker cp "$migration" "$CONTAINER_NAME:/tmp/migration.sql"
  run_psql -f /tmp/migration.sql >/dev/null
done

echo 'Applying country seed twice to verify idempotency.'
docker cp supabase/seed.sql "$CONTAINER_NAME:/tmp/seed.sql"
run_psql -f /tmp/seed.sql >/dev/null
run_psql -f /tmp/seed.sql >/dev/null

app_tables="$(run_psql -Atc "
  select count(*)
  from pg_tables
  where schemaname = 'public'
    and tablename in (
      'countries', 'categories', 'card_designs', 'card_design_images',
      'card_language_templates', 'orders', 'order_items', 'inventory_units',
      'qr_print_jobs', 'qr_print_job_items', 'recipient_registrations',
      'shipments', 'profiles', 'user_roles'
    );
")"
assert_equals 'required application tables' "$app_tables" '14'

rls_tables="$(run_psql -Atc "
  select count(*)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relrowsecurity;
")"
assert_equals 'tables with RLS enabled' "$rls_tables" '22'

country_count="$(run_psql -Atc 'select count(*) from public.countries;')"
assert_equals 'seeded countries' "$country_count" '228'

for function_name in create_order prepare_pod_order register_recipient; do
  function_count="$(run_psql -Atc "
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = '$function_name';
  ")"
  if [[ "$function_count" -lt 1 ]]; then
    echo "Database Gate failed: required function public.$function_name is missing." >&2
    exit 1
  fi
  echo "Verified: function public.$function_name exists"
done

policy_count="$(run_psql -Atc "
  select count(*)
  from pg_policies
  where schemaname = 'public';
")"
if [[ "$policy_count" -lt 45 ]]; then
  echo "Database Gate failed: expected at least 45 RLS policies, actual: $policy_count" >&2
  exit 1
fi
echo "Verified: RLS policies = $policy_count"

echo 'Database Gate passed.'
