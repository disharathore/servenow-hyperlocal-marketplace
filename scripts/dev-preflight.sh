#!/usr/bin/env bash
set -euo pipefail

PORTS="${SERVENOW_DEV_PORTS:-3000 4000}"
DRY_RUN="false"

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="true"
fi

echo "[preflight] Checking busy ports: ${PORTS}"

for port in ${PORTS}; do
  pids="$(lsof -ti tcp:${port} || true)"
  if [[ -z "${pids}" ]]; then
    echo "[preflight] Port ${port}: clear"
    continue
  fi

  echo "[preflight] Port ${port}: busy (PID(s): ${pids//$'\n'/, })"
  if [[ "${DRY_RUN}" == "true" ]]; then
    echo "[preflight] Dry run: skipping kill for port ${port}"
    continue
  fi

  # Force kill stale processes to avoid EADDRINUSE during local dev startup.
  while read -r pid; do
    [[ -z "${pid}" ]] && continue
    kill -9 "${pid}" || true
  done <<< "${pids}"
  echo "[preflight] Port ${port}: cleaned"
done

echo "[preflight] Done"
