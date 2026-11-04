#!/usr/bin/env bash
set -euo pipefail

CS="/home/heptapod/aep/node_modules/.pnpm/@cursor+sdk-linux-x64@1.3.1/node_modules/@cursor/sdk-linux-x64/bin/cursorsandbox"

strings "${CS}" | grep -E 'sandbox|networkStrict|filesystem|NetworkFilter|allow' | head -n 80

# Try a nested schema commonly used by Cursor helpers.
cat > /tmp/aep-policy2.json <<'EOF'
{
  "sandbox": {
    "type": "workspace_readwrite",
    "network": "allowlist",
    "networkAllowlist": []
  }
}
EOF

set +e
"${CS}" --policy /tmp/aep-policy2.json --preflight-only -- /bin/true
echo "policy2_exit=$?"

cat > /tmp/aep-policy3.json <<'EOF'
{
  "sandbox": {
    "filesystem": {
      "default": "deny",
      "allow": [
        { "op": "readWrite", "path": "/tmp" }
      ]
    },
    "network": {
      "default": "deny",
      "allow": []
    }
  }
}
EOF

"${CS}" --policy /tmp/aep-policy3.json --preflight-only -- /bin/true
echo "policy3_exit=$?"
set -e
