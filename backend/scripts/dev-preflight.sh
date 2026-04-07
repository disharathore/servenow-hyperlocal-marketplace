#!/usr/bin/env bash
set -euo pipefail

PORT="${SERVENOW_BACKEND_PORT:-4000}"

echo "[backend-preflight] Checking busy port: ${PORT}"
pids="$(lsof -ti tcp:${PORT} || true)"
if [[ -z "${pids}" ]]; then
  echo "[backend-preflight] Port ${PORT}: clear"
  exit 0
fi

echo "[backend-preflight] Port ${PORT}: busy (PID(s): ${pids//$'\n'/, })"
while read -r pid; do
  [[ -z "${pid}" ]] && continue
  kill -9 "${pid}" || true
done <<< "${pids}"

echo "[backend-preflight] Port ${PORT}: cleaned"
