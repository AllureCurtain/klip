#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-4444}"
SKIP_BUILD="${SKIP_BUILD:-0}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 was not found on PATH. $2" >&2
    exit 1
  fi
}

wait_for_port() {
  local deadline=$((SECONDS + 20))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if (echo >/dev/tcp/127.0.0.1/"$PORT") >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  echo "Timed out waiting for tauri-driver on port $PORT" >&2
  return 1
}

require_command tauri-driver "Install it with: cargo install tauri-driver --locked"

if [ "$SKIP_BUILD" != "1" ]; then
  pnpm build
  (cd src-tauri && cargo build)
fi

APP_PATH="$REPO_ROOT/src-tauri/target/debug/klip"
if [ ! -x "$APP_PATH" ]; then
  echo "Tauri debug binary not found at $APP_PATH" >&2
  exit 1
fi

RUN_ROOT="$REPO_ROOT/e2e/.tmp/run-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$RUN_ROOT/config" "$RUN_ROOT/data"

export SELENIUM_REMOTE_URL="http://127.0.0.1:$PORT"
export KLIP_E2E_APP="$APP_PATH"
export KLIP_E2E_SHOW_WINDOW=1
export KLIP_DATA_DIR="$RUN_ROOT/KlipData"
export KLIP_LOG_DIR="$RUN_ROOT/KlipLogs"
export XDG_CONFIG_HOME="$RUN_ROOT/config"
export XDG_DATA_HOME="$RUN_ROOT/data"
mkdir -p "$KLIP_DATA_DIR" "$KLIP_LOG_DIR"

tauri-driver --port "$PORT" >"$RUN_ROOT/tauri-driver.out.log" 2>"$RUN_ROOT/tauri-driver.err.log" &
DRIVER_PID=$!

cleanup() {
  if kill -0 "$DRIVER_PID" >/dev/null 2>&1; then
    kill "$DRIVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

wait_for_port
pnpm exec mocha "e2e/**/*.e2e.js" --timeout 90000
