import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { Agent, Cursor } from "@cursor/sdk";
import { loadRepoEnvFile } from "../../packages/runtime-cursor/scripts/load-env.mts";

// Force verbose-ish stderr from child preflight by patching nothing; instead mirror
// SDK preflight invocation using the helper binary we know works.

loadRepoEnvFile();
process.env.AEP_LIVE_CURSOR_SDK = "1";
const apiKey = process.env.CURSOR_API_KEY;
if (!apiKey) {
  console.error("missing key");
  process.exit(2);
}

const require = createRequire(import.meta.url);
const sdkEntry = require.resolve("@cursor/sdk");
console.log("sdkEntry", sdkEntry);
console.log("platform", process.platform);
console.log("cwd", process.cwd());

const workRoot = await mkdtemp(join(tmpdir(), "aep-sdk-trace-"));
spawnSync("git", ["init"], { cwd: workRoot });
spawnSync("git", ["config", "user.email", "aep@example.com"], { cwd: workRoot });
spawnSync("git", ["config", "user.name", "aep"], { cwd: workRoot });
await writeFile(join(workRoot, "README.md"), "x\n");
spawnSync("git", ["add", "."], { cwd: workRoot });
spawnSync("git", ["commit", "-m", "i"], { cwd: workRoot });

// Manual preflight matching SDK args shape: --policy <file> --preflight-only -- /bin/true
const home = process.env.HOME ?? "/home/heptapod";
const policyDir = await mkdtemp(join(home, "aep-sdk-policy-"));
const policyPath = join(policyDir, "policy.json");
const policy = {
  sandbox: {
    type: "workspace_readwrite",
    cwd: process.cwd(),
  },
};
await writeFile(policyPath, JSON.stringify(policy));

const helper = spawnSync(
  "bash",
  [
    "-lc",
    `find "${home}/aep/node_modules/.pnpm" -path '*@cursor+sdk-linux-x64@*/node_modules/@cursor/sdk-linux-x64/bin/cursorsandbox' | head -n1`,
  ],
  { encoding: "utf8" },
);
const binary = helper.stdout.trim();
console.log("binary", binary);

const pre = spawnSync(binary, ["--policy", policyPath, "--preflight-only", "--", "/bin/true"], {
  encoding: "utf8",
  cwd: process.cwd(),
});
console.log("manual_preflight_status", pre.status);
console.log("manual_preflight_stderr", pre.stderr);
console.log("manual_preflight_stdout", pre.stdout);

try {
  const models = await Cursor.models.list({ apiKey });
  const modelId = models[0]?.id;
  console.log("creating agent with sandbox...");
  const agent = await Agent.create({
    apiKey,
    model: { id: modelId },
    local: {
      cwd: workRoot,
      sandboxOptions: { enabled: true },
    },
    tools: ["read", "ls"],
    disallowedTools: ["shell", "edit", "mcp", "task"],
  });
  console.log("agent_created", agent.agentId.slice(0, 12));
  try {
    const run = await agent.send("Reply OK");
    for await (const ev of run.stream()) {
      if (ev && typeof ev === "object" && "type" in ev) {
        console.log("event", ev.type);
      }
    }
    const result = await run.wait();
    console.log("result", result.status);
  } finally {
    if (typeof agent[Symbol.asyncDispose] === "function") {
      await agent[Symbol.asyncDispose]();
    }
  }
} catch (error) {
  console.log("error_name", error instanceof Error ? error.name : typeof error);
  console.log("error_message", error instanceof Error ? error.message : String(error));
  if (error && typeof error === "object") {
    for (const key of Object.getOwnPropertyNames(error)) {
      const value = error[key];
      if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
        console.log(`error.${key}=${value}`);
      }
    }
  }
  process.exitCode = 1;
} finally {
  await rm(workRoot, { recursive: true, force: true });
  await rm(policyDir, { recursive: true, force: true });
}
