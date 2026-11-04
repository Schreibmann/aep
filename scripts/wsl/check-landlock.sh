#!/usr/bin/env bash
set -euo pipefail

echo "kernel=$(uname -r)"
echo "os=$(. /etc/os-release && echo "$PRETTY_NAME")"
ls /sys/kernel/security 2>/dev/null || echo "no /sys/kernel/security"
cat /sys/kernel/security/lsm 2>/dev/null || echo "lsm list unavailable"
grep -i landlock /boot/config-$(uname -r) 2>/dev/null || echo "no local kernel config"
zgrep -i landlock /proc/config.gz 2>/dev/null || echo "no /proc/config.gz"

# Minimal landlock probe via Python if available is overkill; try cursorsandbox with a
# schema guessed from Cursor docs examples.
CS="/home/heptapod/aep/node_modules/.pnpm/@cursor+sdk-linux-x64@1.3.1/node_modules/@cursor/sdk-linux-x64/bin/cursorsandbox"
cat > /tmp/aep-policy4.json <<'EOF'
{
  "sandbox": {
    "type": "insecure_none"
  }
}
EOF

set +e
out="$("${CS}" --policy /tmp/aep-policy4.json --preflight-only -- /bin/true 2>&1)"
code=$?
set -e
echo "policy4_exit=${code}"
echo "policy4_out=${out}"
