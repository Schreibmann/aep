#!/usr/bin/env bash
set -euo pipefail

CS="$(find "${HOME}/aep/node_modules/.pnpm" -path '*@cursor+sdk-linux-x64@*/node_modules/@cursor/sdk-linux-x64/bin/cursorsandbox' | head -n 1)"
WORKDIR="$(mktemp -d "${HOME}/aep-sandbox-exec-XXXX")"
POLICY="${WORKDIR}/policy.json"
cat > "${POLICY}" <<EOF
{
  "sandbox": {
    "type": "workspace_readwrite",
    "cwd": "${WORKDIR}"
  }
}
EOF

echo "workdir=${WORKDIR}"
echo "preflight..."
"${CS}" --policy "${POLICY}" --preflight-only -- /bin/true
echo "preflight_ok"

echo "exec..."
set +e
out="$("${CS}" --policy "${POLICY}" -- /bin/echo SANDBOX_EXEC_OK 2>&1)"
code=$?
set -e
echo "exec_out=${out}"
echo "exec_exit=${code}"

# Keep workdir for inspection on failure
if [[ "${code}" -ne 0 ]]; then
  ls -la "${WORKDIR}" || true
else
  rm -rf "${WORKDIR}"
fi
