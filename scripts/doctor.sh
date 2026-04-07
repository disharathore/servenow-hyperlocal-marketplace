#!/usr/bin/env bash
set -euo pipefail

BACKEND_URL="${SERVENOW_BACKEND_URL:-http://localhost:4000}"
FRONTEND_URL="${SERVENOW_FRONTEND_URL:-http://localhost:3000}"

check_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti tcp:${port} || true)"
  if [[ -z "${pids}" ]]; then
    echo "[doctor] Port ${port}: closed"
    return
  fi
  echo "[doctor] Port ${port}: open (PID(s): ${pids//$'\n'/, })"
}

check_http() {
  local label="$1"
  local url="$2"
  local path="$3"
  local expected="$4"
  local response
  response="$(curl -fsS "${url}${path}" 2>/dev/null || true)"
  if [[ -z "${response}" ]]; then
    echo "[doctor] ${label}: unreachable"
    return 1
  fi
  if [[ -n "${expected}" && "${response}" != *"${expected}"* ]]; then
    echo "[doctor] ${label}: unexpected response -> ${response}"
    return 1
  fi
  echo "[doctor] ${label}: ok"
  echo "[doctor] ${label} response: ${response}"
}

echo "[doctor] ServeNow workspace status"
check_port 3000
check_port 4000
check_http "Backend health" "${BACKEND_URL}" "/health" '"status":"ok"'
check_http "Frontend root" "${FRONTEND_URL}" "/" ""

echo "[doctor] Done"
