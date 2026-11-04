#!/usr/bin/env bash
set -euo pipefail

SRC="${1:-/mnt/c/WORK/MY/aep}"
DEST="${HOME}/aep"

mkdir -p "${DEST}"
rsync -a --delete \
  --exclude node_modules \
  --exclude dist \
  --exclude .git \
  --exclude coverage \
  "${SRC}/" "${DEST}/"

# Keep local gitignored secrets available for validation scripts.
if [[ -f "${SRC}/.env" ]]; then
  cp -f "${SRC}/.env" "${DEST}/.env"
  chmod 600 "${DEST}/.env"
fi

# Preserve git history via Windows mount by using a worktree-style note:
# For day-to-day validation we install fresh Linux node_modules in ~/aep.
cd "${DEST}"
pnpm install --frozen-lockfile

# Belt-and-suspenders: ensure cursorsandbox is on the path SDK's locator walks.
# See docs/validation/cursor-sdk-platform-matrix.md (pnpm + platform binary).
bash "${DEST}/scripts/wsl/hoist-sdk-linux-x64.sh" "${DEST}"

echo "synced_to=${DEST}"
echo "node=$(node -v)"
echo "pnpm=$(pnpm -v)"
