#!/usr/bin/env bash
# Puts `ebio_demo` back to the state build-demo.sh left it in: same shops,
# accounts and couriers, no order. Run it between two takes.
set -euo pipefail
cd "$(dirname "$0")"
HERE="$(pwd)"
[ -f demo-base.dump ] || { echo "demo-base.dump missing: run ./build-demo.sh first" >&2; exit 1; }
./with-pg.sh dropdb --if-exists --force ebio_demo
./with-pg.sh createdb ebio_demo
./with-pg.sh pg_restore --no-owner -d ebio_demo "$HERE/demo-base.dump"
echo "ebio_demo reset"
