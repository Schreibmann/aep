#!/usr/bin/env bash
set -euo pipefail

sudo mkdir -p /sys/kernel/security
if ! mountpoint -q /sys/kernel/security; then
  sudo mount -t securityfs securityfs /sys/kernel/security
fi

echo "securityfs_mounted=$(mountpoint -q /sys/kernel/security && echo yes || echo no)"
cat /sys/kernel/security/lsm 2>/dev/null || echo "lsm still unavailable"

# Persist via fstab if missing
if ! grep -q 'securityfs' /etc/fstab; then
  echo 'securityfs /sys/kernel/security securityfs defaults 0 0' | sudo tee -a /etc/fstab >/dev/null
fi
