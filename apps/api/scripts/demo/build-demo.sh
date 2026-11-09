#!/usr/bin/env bash
# Builds the `ebio_demo` database for the tutorial videos, then keeps a dump
# of it (demo-base.dump) that reset-demo.sh restores between two takes.
#
#   1. schema of the local `ebio` database — the one the local code runs on;
#   2. code-tied reference data from it (migration ledger, staff roles);
#   3. catalogue snapshot from production + fictitious people (seed-demo.ts).
#
# Never touches `ebio` beyond reading it. Requires snapshot/ (export-prod-catalog.sh).
set -euo pipefail
cd "$(dirname "$0")"
HERE="$(pwd)"
DEMO_DB=ebio_demo

[ -f snapshot/suppliers.json ] || { echo "snapshot/ missing: run ./export-prod-catalog.sh first" >&2; exit 1; }

./with-pg.sh dropdb --if-exists --force "$DEMO_DB"
./with-pg.sh createdb "$DEMO_DB"
./with-pg.sh sh -c "pg_dump -d ebio --schema-only --no-owner --no-privileges | psql -q -v ON_ERROR_STOP=1 -d $DEMO_DB" >/dev/null
./with-pg.sh sh -c "pg_dump -d ebio --data-only --no-owner -t mikro_orm_migrations -t permissions -t roles -t roles_permissions | psql -q -v ON_ERROR_STOP=1 -d $DEMO_DB" >/dev/null
echo "schema and reference data copied"

(cd ../.. && DATABASE_NAME="$DEMO_DB" npx dotenvx run -q -- npx tsx scripts/demo/seed-demo.ts)

./with-pg.sh pg_dump -d "$DEMO_DB" --format=custom --no-owner --file="$HERE/demo-base.dump"
echo "demo-base.dump written"
