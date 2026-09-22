#!/usr/bin/env bash
set -euo pipefail

mkdir -p "${SEN_DATA_ROOT:-/tmp/sen-data}"

if [[ "$(psql "$DATABASE_URL" -Atqc "select to_regclass('public.profiles') is not null")" != "t" ]]; then
  echo "Initializing the isolated preview database..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /app/database/native/schema.sql
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /app/database/native/seed.sql
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "do \$\$ begin execute format('grant service_role to %I', current_user); end \$\$;"
node /app/scripts/cloud/bootstrap-preview-admin.mjs

export PGRST_DB_URI="$DATABASE_URL"
export PGRST_DB_SCHEMAS="public,murshida_manzil"
export PGRST_DB_ANON_ROLE="service_role"
export PGRST_SERVER_HOST="127.0.0.1"
export PGRST_SERVER_PORT="3002"
postgrest &
postgrest_pid=$!
trap 'kill "$postgrest_pid" 2>/dev/null || true' EXIT TERM INT

for attempt in {1..30}; do
  if curl --fail --silent http://127.0.0.1:3002/ >/dev/null; then
    exec node /app/server.js
  fi
  sleep 1
done

echo "PostgREST did not become ready." >&2
exit 1
