#!/usr/bin/env bash
set -euo pipefail

CS="/home/heptapod/aep/node_modules/.pnpm/@cursor+sdk-linux-x64@1.3.1/node_modules/@cursor/sdk-linux-x64/bin/cursorsandbox"

cat > /tmp/aep-policy.json <<'EOF'
{
  "networkStrict": true,
  "filesystem": {
    "default": "deny",
    "allow": [
      { "op": "readWrite", "path": "/tmp" },
      { "op": "readWrite", "path": "/home/heptapod" }
    ]
  },
  "network": {
    "default": "deny",
    "allow": []
  }
}
EOF

echo "bwrap probe"
bwrap --ro-bind / / --dev /dev --proc /proc -- /bin/true
echo "bwrap_ok"

echo "cursorsandbox preflight"
set +e
"${CS}" --policy /tmp/aep-policy.json --preflight-only -- /bin/true
echo "preflight_exit=$?"
"${CS}" --policy /tmp/aep-policy.json -- /bin/echo sandbox_exec_ok
echo "exec_exit=$?"
set -e
