#!/usr/bin/env bash
set -euo pipefail

# Map localhost ports (USB reverse) then start the Expo dev-client on device.
# Usage (depuis apps/mobile): pnpm dev:device [--clear]

API_PORT=3000
METRO_PORT=8081
MINIO_PORT=9000

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

echo "🔌 Mapping des ports localhost → device..."
adb reverse "tcp:${API_PORT}" "tcp:${API_PORT}"
adb reverse "tcp:${METRO_PORT}" "tcp:${METRO_PORT}"
adb reverse "tcp:${MINIO_PORT}" "tcp:${MINIO_PORT}"
adb reverse --list

echo "🚀 Démarrage du dev-client (bundler sur localhost)..."
exec pnpm exec expo start --dev-client --localhost "$@"
