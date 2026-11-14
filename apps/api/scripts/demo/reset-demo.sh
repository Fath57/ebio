#!/usr/bin/env bash
# Puts `ebio_demo` back to the state build-demo.sh left it in: same shops,
# accounts and couriers, no order. Run it between two takes, then restart
# the demo API (systemctl --user restart ebio-api-demo).
set -euo pipefail
cd "$(dirname "$0")"
HERE="$(pwd)"
[ -f demo-base.dump ] || { echo "demo-base.dump missing: run ./build-demo.sh first" >&2; exit 1; }
./with-pg.sh dropdb --if-exists --force ebio_demo
./with-pg.sh createdb ebio_demo
./with-pg.sh pg_restore --no-owner -d ebio_demo "$HERE/demo-base.dump"
# The Valise departure (seed-valise.ts) is re-anchored on today: it leaves in
# 12 days and takes orders for 6, however old the dump is.
./with-pg.sh psql -q -v ON_ERROR_STOP=1 -d ebio_demo -c "UPDATE export_departures d
  SET departs_on = CURRENT_DATE + 12, deposit_deadline = date_trunc('day', NOW()) + INTERVAL '9 days 17 hours'
  FROM export_agencies a WHERE a.id = d.agency_id AND a.name = 'Atlantique Fret'"
echo "ebio_demo reset"
