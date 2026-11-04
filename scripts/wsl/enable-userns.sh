#!/usr/bin/env bash
set -euo pipefail

echo "Before:"
sysctl kernel.apparmor_restrict_unprivileged_userns 2>/dev/null || true
sysctl kernel.unprivileged_userns_clone 2>/dev/null || true
cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || echo "apparmor_restrict missing"
id

# Ubuntu 23.10+/24.04 often defaults this to 1, which breaks bubblewrap/cursorsandbox.
if [[ -f /proc/sys/kernel/apparmor_restrict_unprivileged_userns ]]; then
  echo 0 | sudo tee /proc/sys/kernel/apparmor_restrict_unprivileged_userns >/dev/null
fi

# Persist for future boots inside this distro.
echo 'kernel.apparmor_restrict_unprivileged_userns=0' | sudo tee /etc/sysctl.d/99-aep-userns.conf >/dev/null
sudo sysctl --system >/dev/null 2>&1 || true

echo "After:"
cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || true

set +e
bwrap --ro-bind / / --dev /dev --proc /proc -- /bin/true
echo "bwrap_exit=$?"
CS="$(find "${HOME}/aep/node_modules/.pnpm" -path '*@cursor+sdk-linux-x64@*/node_modules/@cursor/sdk-linux-x64/bin/cursorsandbox' | head -n 1)"
"${CS}" --preflight-only -- /bin/true
echo "cursorsandbox_preflight_exit=$?"
set -e
