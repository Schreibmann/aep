#!/usr/bin/env bash
set -euo pipefail

CS="$(find "${HOME}/aep/node_modules/.pnpm" -path '*@cursor+sdk-linux-x64@*/node_modules/@cursor/sdk-linux-x64/bin/cursorsandbox' | head -n 1)"
echo "cursorsandbox=${CS}"
"${CS}" --help 2>&1 | sed -n '1,80p' || true

echo "=== kernel / lsm / userns ==="
uname -r
cat /sys/kernel/security/lsm 2>/dev/null || echo "lsm unavailable"
sysctl kernel.apparmor_restrict_unprivileged_userns 2>/dev/null || echo "apparmor_restrict sysctl missing"
sysctl kernel.unprivileged_userns_clone 2>/dev/null || echo "unprivileged_userns_clone sysctl missing"
ls -l /proc/self/ns/user 2>/dev/null || true

if [[ -f /proc/sys/kernel/apparmor_restrict_unprivileged_userns ]]; then
  echo 0 | sudo tee /proc/sys/kernel/apparmor_restrict_unprivileged_userns >/dev/null
  echo "set apparmor_restrict_unprivileged_userns=0"
fi

echo "=== unshare probe ==="
set +e
unshare --user --map-root-user /bin/true
echo "unshare_exit=$?"
set -e

WORKDIR="$(mktemp -d /tmp/aep-sandbox-preflight-XXXX)"
echo "workdir=${WORKDIR}"

echo "=== policy via --sandbox-policy (forum style) ==="
set +e
"${CS}" \
  --sandbox-policy-cwd "${WORKDIR}" \
  --sandbox-policy "{\"type\":\"workspace_readwrite\",\"cwd\":\"${WORKDIR}\"}" \
  --preflight-only \
  -- /bin/true
echo "forum_style_exit=$?"

"${CS}" \
  --sandbox-policy-cwd "${WORKDIR}" \
  --sandbox-policy "{\"type\":\"workspace_readonly\",\"cwd\":\"${WORKDIR}\"}" \
  --preflight-only true
echo "forum_style_true_exit=$?"

# Also try --policy unified file if help mentions it
cat > /tmp/aep-unified-policy.json <<EOF
{
  "sandbox": {
    "type": "workspace_readwrite",
    "cwd": "${WORKDIR}"
  }
}
EOF
"${CS}" --policy /tmp/aep-unified-policy.json --preflight-only -- /bin/true
echo "unified_policy_exit=$?"
set -e

rm -rf "${WORKDIR}"
