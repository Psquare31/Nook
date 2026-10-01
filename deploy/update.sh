#!/usr/bin/env bash
# Run on the server to deploy the latest commit: bash deploy/update.sh
set -euo pipefail

cd "$(dirname "$0")/.."

git pull --ff-only
npm ci
npm run build:server
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

port="$(grep -E '^PORT=' .env 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '[:space:]' || true)"
curl --fail --silent --show-error --retry 5 --retry-delay 1 --retry-connrefused \
  "http://127.0.0.1:${port:-3001}/health"
echo
