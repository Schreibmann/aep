#!/usr/bin/env bash
set -euo pipefail

CS="$(find "${HOME}/aep/node_modules/.pnpm" -path '*@cursor+sdk-linux-x64@*/node_modules/@cursor/sdk-linux-x64/bin/cursorsandbox' | head -n 1)"
echo "cursorsandbox=${CS}"
if [[ -z "${CS}" ]]; then
  echo "helper_missing=1"
  exit 1
fi

set +e
"${CS}" --preflight-only
PRE=$?
set -e
echo "preflight_exit=${PRE}"

echo "unprivileged_userns_clone=$(cat /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null || echo missing)"
echo "max_user_namespaces=$(cat /proc/sys/user/max_user_namespaces 2>/dev/null || echo missing)"

set +e
bwrap --ro-bind / / --dev /dev --proc /proc -- tmptrue
BWRAP=$?
set -e
echo "bwrap_exit=${BWRAP}"

# Capture the exact SDK error without our classifier wrapper by a tiny node probe.
cd "${HOME}/aep/packages/runtime-cursor"
node --experimental-strip-types - <<'NODE'
import { Agent, Cursor } from "@cursor/sdk";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadRepoEnvFile } from "./scripts/load-env.mts";

loadRepoEnvFile();
process.env.AEP_LIVE_CURSOR_SDK = "1";
const apiKey = process.env.CURSOR_API_KEY;
if (!apiKey) {
  console.log("no_key");
  process.exit(2);
}
const workRoot = await mkdtemp(join(tmpdir(), "aep-sbx-"));
try {
  spawnSync("git", ["init"], { cwd: workRoot });
  spawnSync("git", ["config", "user.email", "aep@example.com"], { cwd: workRoot });
  spawnSync("git", ["config", "user.name", "aep"], { cwd: workRoot });
  await writeFile(join(workRoot, "README.md"), "x\n");
  spawnSync("git", ["add", "."], { cwd: workRoot });
  spawnSync("git", ["commit", "-m", "i"], { cwd: workRoot });
  const models = await Cursor.models.list({ apiKey });
  const modelId = models[0]?.id;
  const agent = await Agent.create({
    apiKey,
    model: { id: modelId },
    local: { cwd: workRoot, sandboxOptions: { enabled: true } },
    tools: ["read", "ls"],
    disallowedTools: ["shell", "edit", "mcp", "task"],
  });
  try {
    const run = await agent.send("Reply: OK");
    for await (const _ of run.stream()) {
      // drain
    }
    const result = await run.wait();
    console.log(JSON.stringify({ ok: true, status: result.status }));
  } finally {
    if (typeof agent[Symbol.asyncDispose] === "function") {
      await agent[Symbol.asyncDispose]();
    }
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.log(JSON.stringify({ ok: false, name: error instanceof Error ? error.name : "Error", message: message.slice(0, 500) }));
  process.exitCode = 1;
} finally {
  await rm(workRoot, { recursive: true, force: true });
}
NODE
