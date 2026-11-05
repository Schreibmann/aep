#!/usr/bin/env bash
set -euo pipefail

CS="$(find "${HOME}/aep/node_modules/.pnpm" -path '*@cursor+sdk-linux-x64@*/node_modules/@cursor/sdk-linux-x64/bin/cursorsandbox' | head -n 1)"
WORKDIR="$(mktemp -d "${HOME}/aep-sandbox-keep-XXXX")"
POLICY="${WORKDIR}/policy.json"
echo hello > "${WORKDIR}/marker.txt"
cat > "${POLICY}" <<EOF
{
  "sandbox": {
    "type": "workspace_readwrite",
    "cwd": "${WORKDIR}"
  }
}
EOF

ls -la "${WORKDIR}"
"${CS}" --policy "${POLICY}" --preflight-only -- /bin/true
echo "after_preflight:"
ls -la "${WORKDIR}"

# Copy policy outside workspace and reference it from outside
OUT_POLICY="${HOME}/aep-policy-outside.json"
cp "${POLICY}" "${OUT_POLICY}"
set +e
"${CS}" --policy "${OUT_POLICY}" -- /bin/echo OUTSIDE_POLICY_OK
echo "outside_policy_exit=$?"
set -e
ls -la "${WORKDIR}" || true
ls -la "${OUT_POLICY}" || true
rm -rf "${WORKDIR}" "${OUT_POLICY}"
