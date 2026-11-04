#!/usr/bin/env bash
set -euo pipefail

sudo tee /etc/wsl.conf >/dev/null <<'EOF'
[user]
default=heptapod

[boot]
systemd=true

[interop]
appendWindowsPath=false

[network]
generateHosts=true
generateResolvConf=true
EOF

echo "updated /etc/wsl.conf"
cat /etc/wsl.conf
