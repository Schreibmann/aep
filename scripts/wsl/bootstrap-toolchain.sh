#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  git \
  build-essential \
  python3 \
  gnupg

# Node.js 26.x (NodeSource)
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -qE '^v26\.'; then
  curl -fsSL https://deb.nodesource.com/setup_26.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# pnpm via corepack when available, else npm global
if command -v corepack >/dev/null 2>&1; then
  sudo corepack enable
  sudo corepack prepare pnpm@10.20.0 --activate
else
  sudo npm install -g pnpm@10.20.0
fi

echo "node=$(node -v)"
echo "npm=$(npm -v)"
echo "pnpm=$(pnpm -v)"
echo "git=$(git --version)"
