#!/usr/bin/env bash
# Opens an app variant from a clean state, then plays a Maestro flow on it.
#   ./run.sh supplier supplier-orders.yaml
# MODE=release (default): the release APK, JS bundled — what gets filmed.
# MODE=dev: the dev client on its Metro server. The apps share their URL
# scheme, so the link must name the package, which Maestro's openLink cannot.
set -euo pipefail
cd "$(dirname "$0")"
variant="$1"
flow="$2"
device="${DEVICE:-emulator-5580}"
case "$variant" in
  client) package=com.ebio.mobile; port=8081 ;;
  courier) package=com.ebio.courier; port=8082 ;;
  supplier) package=com.ebio.supplier; port=8083 ;;
  *) echo "Variante inconnue : $variant" >&2; exit 1 ;;
esac
if [ "${SKIP_LAUNCH:-0}" = 1 ]; then
  exec "$HOME/.maestro/bin/maestro" --device "$device" test "$flow"
fi
adb -s "$device" reverse "tcp:$port" "tcp:$port" >/dev/null
adb -s "$device" reverse tcp:3010 tcp:3020 >/dev/null
adb -s "$device" shell am force-stop "$package"
# Every take starts signed out, from the same state: a session kept from a
# previous take points at accounts the demo reset has recreated.
adb -s "$device" shell pm clear "$package" >/dev/null
for permission in ACCESS_FINE_LOCATION ACCESS_COARSE_LOCATION POST_NOTIFICATIONS CAMERA; do
  adb -s "$device" shell pm grant "$package" "android.permission.$permission" 2>/dev/null || true
done
if [ "${MODE:-release}" = dev ]; then
  adb -s "$device" shell am start -p "$package" -a android.intent.action.VIEW \
    -d "exp+ebio-mobile://expo-development-client/?url=http%3A%2F%2Flocalhost%3A$port" >/dev/null
else
  adb -s "$device" shell monkey -p "$package" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
fi
# LAUNCH_ONLY: open the app and stop there — record.sh starts filming only
# once the app is on screen, so no take shows the phone's home screen.
if [ "${LAUNCH_ONLY:-0}" = 1 ]; then
  exit 0
fi
exec "$HOME/.maestro/bin/maestro" --device "$device" test "$flow"
