#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${VIBEIDE_WINDOWS_SMOKE_IMAGE:-${COFFECAT_WINDOWS_SMOKE_IMAGE:-vibeide-windows-smoke:local}}"
MODE="${1:-pack}"
DOCKER_CMD="${DOCKER_CMD:-docker}"

if ! command -v "${DOCKER_CMD%% *}" >/dev/null 2>&1; then
  echo "docker is not installed or not in PATH" >&2
  exit 127
fi

case "$MODE" in
  pack)
    RUN_CMD='cd electron && npm run pack:win'
    ;;
  dist)
    RUN_CMD='cd electron && npm run dist:win'
    ;;
  shell)
    RUN_CMD='bash'
    ;;
  *)
    echo "usage: scripts/docker_windows_smoke.sh [pack|dist|shell]" >&2
    exit 2
    ;;
esac

mkdir -p "$ROOT_DIR/electron/dist-package"

$DOCKER_CMD build \
  -f "$ROOT_DIR/docker/windows-smoke.Dockerfile" \
  -t "$IMAGE_NAME" \
  "$ROOT_DIR"

$DOCKER_CMD run --rm \
  -v "$ROOT_DIR/electron/dist-package:/workspace/electron/dist-package" \
  "$IMAGE_NAME" \
  bash -lc "$RUN_CMD"
