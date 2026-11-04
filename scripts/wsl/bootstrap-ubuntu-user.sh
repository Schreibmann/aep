#!/usr/bin/env bash
set -euo pipefail

USERNAME="${1:-heptapod}"

if ! id -u "${USERNAME}" >/dev/null 2>&1; then
  useradd -m -s /bin/bash -G sudo "${USERNAME}"
fi

SUDOERS_FILE="/etc/sudoers.d/${USERNAME}"
printf '%s ALL=(ALL) NOPASSWD:ALL\n' "${USERNAME}" > "${SUDOERS_FILE}"
chmod 440 "${SUDOERS_FILE}"

cat > /etc/wsl.conf <<EOF
[user]
default=${USERNAME}

[boot]
systemd=true
EOF

id "${USERNAME}"
echo "wsl.conf:"
cat /etc/wsl.conf
