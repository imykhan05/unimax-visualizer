#!/usr/bin/env bash
# One command: build the site, serve it, open a Cloudflare tunnel, print the
# public link. Visitors need no login and nothing installed.
#
#   ./scripts/share.sh
#
# Stop it with Ctrl+C; the link dies with it, since a quick tunnel only lives
# as long as this machine is serving.

set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-5175}"

if ! command -v cloudflared >/dev/null 2>&1; then
  cat >&2 <<'MSG'
cloudflared nahi mila. Ek baar install kar lo:

  macOS:    brew install cloudflared
  Windows:  winget install --id Cloudflare.cloudflared
  Linux:    https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

Phir ye script dobara chalao.
MSG
  exit 1
fi

echo "==> Building the web app"
( cd frontend && npm install --silent && npm run build --silent )

if [ ! -f out/unimax-visualizer.apk ] && [ ! -f frontend/android/app/build/outputs/apk/debug/app-debug.apk ]; then
  echo "==> No APK found locally."
  echo "    Download page will hide that button. To include one, either build it"
  echo "    (cd frontend/android && ./gradlew assembleDebug) or drop the file at"
  echo "    out/unimax-visualizer.apk"
fi

echo "==> Assembling the site"
node scripts/build-site.mjs

echo "==> Starting the server on :$PORT"
PORT="$PORT" node scripts/serve-site.mjs &
SERVER_PID=$!
# Make sure the server goes down with the tunnel, however this script exits.
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM

# Wait for it to accept connections before exposing it.
for _ in $(seq 1 30); do
  if curl -fs -o /dev/null "http://localhost:$PORT/" 2>/dev/null; then break; fi
  sleep 0.5
done

echo
echo "==> Opening the Cloudflare tunnel (public link niche aayega)"
echo "    App:      <link>/"
echo "    Download: <link>/download.html"
echo
cloudflared tunnel --url "http://localhost:$PORT" --no-autoupdate
