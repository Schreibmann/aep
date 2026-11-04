#!/usr/bin/env bash
set -euo pipefail

CS="$(find "${HOME}/aep/node_modules/.pnpm" -path '*@cursor+sdk-linux-x64@*/node_modules/@cursor/sdk-linux-x64/bin/cursorsandbox' | head -n 1)"
WORKDIR="$(mktemp -d "${HOME}/aep-sandbox-ws-XXXX")"
POLICY="${HOME}/aep-policy-fixed.json"
echo marker > "${WORKDIR}/marker.txt"
cat > "${POLICY}" <<EOF
{
  "sandbox": {
    "type": "workspace_readwrite",
    "cwd": "${WORKDIR}"
  }
}
EOF

echo "exec with outside policy..."
set +e
out="$("${CS}" --policy "${POLICY}" -- /bin/sh -c 'echo SANDBOX_OK; pwd; ls -la; cat marker.txt' 2>&1)"
code=$?
set -e
echo "exec_out=${out}"
echo "exec_exit=${code}"
echo "policy_still_exists=$([[ -f ${POLICY} ]] && echo yes || echo no)"
echo "workdir_listing:"
ls -la "${WORKDIR}" || true
rm -rf "${WORKDIR}" "${POLICY}"
