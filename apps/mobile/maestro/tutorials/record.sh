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

# A personal phone is set for filming — light theme, Do not disturb, no
# password autofill (it filled a saved password into the demo login) — and
# put back exactly as it was afterwards, even when the take fails.
night_before="$(adb -s "$device" shell cmd uimode night | awk '{print $3}')"
zen_before="$(adb -s "$device" shell settings get global zen_mode)"
autofill_before="$(adb -s "$device" shell settings get secure autofill_service)"
restore_device() {
  adb -s "$device" shell cmd uimode night "$night_before" >/dev/null
  if [ "$zen_before" = 0 ]; then adb -s "$device" shell cmd notification set_dnd off >/dev/null; fi
  adb -s "$device" shell settings put secure autofill_service "$autofill_before"
}
trap restore_device EXIT
adb -s "$device" shell cmd uimode night no >/dev/null
adb -s "$device" shell cmd notification set_dnd priority >/dev/null
adb -s "$device" shell settings put secure autofill_service null

"$api_dir/scripts/demo/reset-demo.sh"
systemctl --user restart ebio-api-demo
until curl -sf http://localhost:3020/api/search/categories >/dev/null; do sleep 2; done
if [ "$scenario" != none ]; then
  (cd "$api_dir" && DATABASE_NAME=ebio_demo npx dotenvx run -q -- npx tsx scripts/demo/scenario.ts "$scenario")
fi

# The app is opened first and filming starts once it is on screen: started
# earlier, the take began on the phone's home screen — apps, wallpaper.
LAUNCH_ONLY=1 ./run.sh "$variant" "$flow"
sleep 2
# screenrecord stops by itself after 3 minutes, Android's limit.
adb -s "$device" shell rm -f /sdcard/take.mp4
adb -s "$device" shell screenrecord --bit-rate 8000000 /sdcard/take.mp4 &
recorder=$!
# Wall-clock start of the video: produce.py lines Maestro's taps up with it.
sleep 0.5
date +%H:%M:%S.%3N > "$out.start"
sleep 0.5
status=0
SKIP_LAUNCH=1 ./run.sh "$variant" "$flow" || status=$?
latest_log="$(ls -td "$HOME"/.maestro/tests/*/ | head -1)maestro.log"
cp "$latest_log" "$out.maestro.log"
sleep 2
adb -s "$device" shell pkill -INT screenrecord || true
wait "$recorder" || true
sleep 1
adb -s "$device" pull /sdcard/take.mp4 "$out" >/dev/null
echo "Vidéo : $out"
exit "$status"
