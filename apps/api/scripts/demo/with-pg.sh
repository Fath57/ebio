#!/usr/bin/env bash
# Runs a Postgres client (psql, pg_dump, createdb…) against the local server
# with the API's credentials from apps/api/.env.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec npx dotenvx run -q -- sh -c 'export PGHOST="$DATABASE_HOST" PGPORT="$DATABASE_PORT" PGUSER="$DATABASE_USER" PGPASSWORD="$DATABASE_PASSWORD"; exec "$@"' sh "$@"
