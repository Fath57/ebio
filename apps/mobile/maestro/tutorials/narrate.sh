#!/usr/bin/env bash
# Lays a voice-over on a tutorial video.
#   ./narrate.sh take.mp4 narration/supplier-orders.txt [voice]
# Each line of the narration file is « MM:SS | text »: the sentence is spoken
# (OpenAI gpt-4o-mini-tts, the model Assita already uses) and placed at that
# time. Output: take-voix.mp4 next to the video. The key is read from apps/api/.env.
set -euo pipefail
video="$1"
script="$2"
voice="${3:-coral}"
speed="${SPEED:-1.15}"
here="$(cd "$(dirname "$0")" && pwd)"
api_dir="$(cd "$here/../../../api" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

key="$(cd "$api_dir" && npx dotenvx get OPENAI_API_KEY -q 2>/dev/null)"
[ -n "$key" ] || { echo "OPENAI_API_KEY absente de apps/api/.env" >&2; exit 1; }

instructions="Voix off de démo d'application, en français. Ton assuré, souriant et professionnel, rythme soutenu et fluide, comme une présentation produit. Phrases enchaînées sans pauses inutiles, fins de phrase nettes."
inputs=()
filters=""
index=0
next_free_ms=0
while IFS= read -r line; do
  case "$line" in ''|'#'*) continue ;; esac
  timecode="${line%%|*}"
  # « MM:SS [Step title] | text »: the title is for dress.py.
  timecode="${timecode%%[*}"
  text="${line#*|}"
  text="$(echo "$text" | sed 's/^ *//')"
  minutes="${timecode%%:*}"
  seconds="${timecode#*:}"
  delay_ms=$(( (10#${minutes// /} * 60 + 10#${seconds// /}) * 1000 ))
  segment="$work/segment-$index.mp3"
  python3 -c 'import json,sys; print(json.dumps({"model":"gpt-4o-mini-tts","voice":sys.argv[1],"input":sys.argv[2],"instructions":sys.argv[3],"speed":float(sys.argv[4]),"response_format":"mp3"}))' \
    "$voice" "$text" "$instructions" "$speed" > "$work/request.json"
  curl -sf https://api.openai.com/v1/audio/speech \
    -H "Authorization: Bearer $key" -H "Content-Type: application/json" \
    --data @"$work/request.json" -o "$segment"
  # A sentence never starts before the previous one is over: if it runs past
  # the next mark, the next one waits for it, with a short breath between.
  if [ "$delay_ms" -lt "$next_free_ms" ]; then
    delay_ms=$next_free_ms
  fi
  duration_ms=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$segment" | awk '{printf "%d", $1 * 1000}')
  next_free_ms=$((delay_ms + duration_ms + 400))
  inputs+=(-i "$segment")
  filters+="[$((index + 1)):a]adelay=${delay_ms}|${delay_ms}[a$index];"
  index=$((index + 1))
  echo "phrase $index : prévue à $timecode, placée à $((delay_ms / 1000)),$(( (delay_ms % 1000) / 100 )) s, dure $((duration_ms / 1000)),$(( (duration_ms % 1000) / 100 )) s"
done < "$script"

mix=""
for i in $(seq 0 $((index - 1))); do mix+="[a$i]"; done
out="${video%.mp4}-voix.mp4"
ffmpeg -v error -y -i "$video" "${inputs[@]}" \
  -filter_complex "${filters}${mix}amix=inputs=$index:normalize=0,apad[voice]" \
  -map 0:v -map "[voice]" -c:v copy -c:a aac -b:a 160k -shortest "$out"
echo "Vidéo avec voix : $out"
