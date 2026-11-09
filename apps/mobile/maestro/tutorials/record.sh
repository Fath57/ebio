#!/usr/bin/env bash
# Films one tutorial take on the emulator, from a fresh demo state.
#   ./record.sh supplier supplier-orders.yaml supplier-order
# Arguments: app variant, Maestro flow, demo scenario (scenario.ts) or "none".
# The video lands in ~/Vidéos/ebio-tutos/<flow>-<date>.mp4.
set -euo pipefail
cd "$(dirname "$0")"
variant="$1"
flow="$2"
scenario="${3:-none}"
device="${DEVICE:-emulator-5580}"
api_dir="$(cd ../../../api && pwd)"
out_dir="$HOME/Vidéos/ebio-tutos"
mkdir -p "$out_dir"
out="$out_dir/${flow%.yaml}-$(date +%Y%m%d-%H%M%S).mp4"

"$api_dir/scripts/demo/reset-demo.sh"
systemctl --user restart ebio-api-demo
until curl -sf http://localhost:3020/api/search/categories >/dev/null; do sleep 2; done
if [ "$scenario" != none ]; then
  (cd "$api_dir" && DATABASE_NAME=ebio_demo npx dotenvx run -q -- npx tsx scripts/demo/scenario.ts "$scenario")
fi

# screenrecord stops by itself after 3 minutes, Android's limit.
adb -s "$device" shell rm -f /sdcard/take.mp4
adb -s "$device" shell screenrecord --bit-rate 8000000 /sdcard/take.mp4 &
recorder=$!
sleep 1
status=0
./run.sh "$variant" "$flow" || status=$?
sleep 2
adb -s "$device" shell pkill -INT screenrecord || true
wait "$recorder" || true
sleep 1
adb -s "$device" pull /sdcard/take.mp4 "$out" >/dev/null
echo "Vidéo : $out"
exit "$status"
