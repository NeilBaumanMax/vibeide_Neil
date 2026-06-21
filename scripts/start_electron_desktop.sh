#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ELECTRON_DIR="$PROJECT_ROOT/electron"
RUNTIME_DIR="$PROJECT_ROOT/runtime"

require_file() {
  local target="$1"
  local hint="$2"
  if [ ! -e "$target" ]; then
    echo "[start] 缺少: $target"
    echo "[start] $hint"
    exit 1
  fi
}

wait_for_port() {
  local port="$1"
  local retries="${2:-30}"
  local i
  for ((i=0; i<retries; i++)); do
    if command -v lsof >/dev/null 2>&1 && lsof -i "tcp:${port}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

require_file "$ELECTRON_DIR/package.json" "Electron 目录不完整。"
require_file "$RUNTIME_DIR/package.json" "Runtime 目录不完整。"
require_file "$RUNTIME_DIR/src/index.ts" "Runtime 入口缺失。"

mkdir -p \
  "$RUNTIME_DIR/browser_runtime" \
  "$RUNTIME_DIR/chrome_profile" \
  "$RUNTIME_DIR/cookies" \
  "$RUNTIME_DIR/logs" \
  "$RUNTIME_DIR/pids" \
  "$RUNTIME_DIR/claude-session" \
  "$RUNTIME_DIR/claude-config"

if [ ! -f "$RUNTIME_DIR/state.json" ]; then
  cat >"$RUNTIME_DIR/state.json" <<'EOF'
{
  "status": "idle",
  "lastStartedAt": null,
  "lastConnectedAt": null
}
EOF
fi

cat >"$RUNTIME_DIR/ports.json" <<'EOF'
{
  "cdpPort": 9230
}
EOF

cd "$ELECTRON_DIR"

export ELECTRON_DEV=1
export CDP_PORT="${CDP_PORT:-9230}"
export RUNTIME_ROOT="$RUNTIME_DIR"

# Clear stale dev processes so Electron always connects to the current renderer.
if command -v lsof >/dev/null 2>&1; then
  for port in 5173 9230; do
    pids="$(lsof -ti tcp:${port} 2>/dev/null || true)"
    if [ -n "$pids" ]; then
      kill $pids 2>/dev/null || true
      sleep 1
    fi
  done
fi

echo "[start] runtime health"
(cd "$RUNTIME_DIR" && npm run dev)

echo "[start] launching renderer + electron"
npx concurrently \
  --kill-others-on-fail \
  "npm run dev:renderer -- --port 5173 --strictPort" \
  "npm run dev:electron" &

CONCURRENT_PID=$!
trap 'kill $CONCURRENT_PID 2>/dev/null || true' EXIT

if wait_for_port 5173 45; then
  echo "[start] renderer ready: http://127.0.0.1:5173"
else
  echo "[start] renderer port 5173 未在预期时间内就绪"
fi

wait "$CONCURRENT_PID"
