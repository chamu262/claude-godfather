#!/usr/bin/env bash
# Retakes the README screenshots on demo data with headless Chrome.
#   bash scripts/screenshots.sh
# It starts its own demo server on a spare port, loads the page once (sessions recorded as
# working), waits 20 seconds while the demo clock moves on, then takes the shots, so the
# overview shows a session as "done, unseen".
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${SHOT_PORT:-4419}"
OUT="$REPO/docs/screenshots"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[[ -x "$CHROME" ]] || CHROME="$(command -v google-chrome || command -v chromium)"
PROFILE="$(mktemp -d)"
GODFATHER_PORT="$PORT" node "$REPO/dashboard/server.mjs" --demo >/dev/null &
SERVER=$!
trap 'kill $SERVER 2>/dev/null; rm -rf "$PROFILE"' EXIT
for _ in $(seq 50); do curl -fs -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 0.1; done
shot() { # name hash [height] [query]
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$PROFILE" --force-device-scale-factor=2 \
    --window-size=1360,"${3:-860}" --virtual-time-budget=6000 --screenshot="$OUT/$1.png" \
    "http://127.0.0.1:$PORT/?every=500${4:+&q=$4}#$2" >/dev/null 2>&1
  echo "  $1.png"
}
mkdir -p "$OUT"
shot _warmup overview && rm -f "$OUT/_warmup.png"
echo "Waiting 20s for the demo clock…"; sleep 20
shot overview overview
shot session-detail sessions/demo-02 1180
shot handover sessions/demo-02/handover 1500
shot search search 860 settings
shot usage usage 1180
shot tasks-collisions tasks
shot setup setup 1000
