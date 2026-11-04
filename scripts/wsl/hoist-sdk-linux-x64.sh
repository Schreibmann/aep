#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-${HOME}/aep}"
cd "${ROOT}"

SRC="$(find "${ROOT}/node_modules/.pnpm" -path '*@cursor+sdk-linux-x64@*/node_modules/@cursor/sdk-linux-x64' -type d | head -n1)"
if [[ -z "${SRC}" ]]; then
  echo "platform package not found under node_modules/.pnpm" >&2
  exit 1
fi

mkdir -p node_modules/@cursor
ln -sfn "${SRC}" node_modules/@cursor/sdk-linux-x64
echo "hoisted=${ROOT}/node_modules/@cursor/sdk-linux-x64 -> ${SRC}"
test -x "${ROOT}/node_modules/@cursor/sdk-linux-x64/bin/cursorsandbox"
echo "cursorsandbox_ok"
