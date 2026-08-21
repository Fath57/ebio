#!/usr/bin/env bash
set -euo pipefail

# Map localhost ports (USB reverse), start the Expo dev-client bundler, and
# open the app on the device once Metro answers.
# Usage (depuis apps/mobile): pnpm dev:device [--clear]
#
# The app always calls http://localhost:3000 from the phone. On the host, the
# API may run on 3000 or, when another project holds that port (DEMCRM), on
# 3010 — the reverse below bridges the phone's 3000 to wherever the eBio API
# actually answers. Override with API_HOST_PORT=xxxx if needed.

APP_PORT=3000
METRO_PORT=8081
DEEP_LINK="exp+ebio-mobile://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"

# Se placer à la racine de l'app mobile, peu importe d'où le script est appelé
cd "$(dirname "$0")/.."

if ! command -v adb >/dev/null 2>&1; then
  echo "❌ adb introuvable. Installe les platform-tools Android." >&2
  exit 1
fi

# Attendre qu'un device soit branché et autorisé
echo "⏳ Attente d'un device Android..."
adb wait-for-device

if ! adb devices | grep -qw "device"; then
  echo "❌ Aucun device autorisé. Branche le téléphone et accepte le débogage USB." >&2
  adb devices >&2
  exit 1
fi

# Find where the eBio API answers: 3000 first, then 3010. A JSON body on the
# banners route tells eBio apart from whatever else holds the port.
detect_api_port() {
  for port in 3000 3010; do
    if curl -sf -m 2 "http://localhost:${port}/api/banners/active" 2>/dev/null | head -c 1 | grep -q '\['; then
      echo "$port"
      return
    fi
  done
  echo ""
}

API_HOST_PORT="${API_HOST_PORT:-$(detect_api_port)}"
if [ -z "$API_HOST_PORT" ]; then
  # A bridge to a dead port only produces a confusing "network error" in the
  # app: better to stop here with the fix in hand.
  echo "❌ API eBio introuvable sur 3000/3010. Lance-la d'abord :" >&2
  echo "    cd ../api && pnpm dev    # .env la fige sur 3010" >&2
  echo "    (ou force un port : API_HOST_PORT=xxxx pnpm dev:device)" >&2
  exit 1
fi

echo "🔌 Mapping des ports localhost → device (API hôte: ${API_HOST_PORT})..."
adb reverse "tcp:${APP_PORT}" "tcp:${API_HOST_PORT}"
adb reverse "tcp:${METRO_PORT}" "tcp:${METRO_PORT}"
adb reverse --list

# Open the app once Metro is up. Without the deep link the dev-client aims at
# the LAN IP instead of localhost and never reaches the bundler.
(
  until curl -sf -m 2 "http://localhost:${METRO_PORT}/status" >/dev/null 2>&1; do
    sleep 2
  done
  echo "📱 Ouverture de l'app sur le device..."
  adb shell am start -a android.intent.action.VIEW -d "$DEEP_LINK" >/dev/null 2>&1
) &

echo "🚀 Démarrage du dev-client (bundler sur localhost)..."
exec ./node_modules/.bin/expo start --dev-client --localhost "$@"
