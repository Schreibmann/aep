/**
 * Opt-in, potentially billable Cursor SDK live validation.
 *
 * Required:
 *   AEP_LIVE_CURSOR_SDK=1
 *   CURSOR_API_KEY set (value never printed)
 *
 * Creates a disposable git repo under the OS temp directory, runs a minimal
 * local sandboxed session, then deletes the disposable tree.
 */
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent, Cursor } from "@cursor/sdk";

function requireLiveOptIn(): string {
  if (process.env.AEP_LIVE_CURSOR_SDK !== "1") {
    console.error("Refusing live Cursor SDK validation: set AEP_LIVE_CURSOR_SDK=1 explicitly.");
    process.exit(2);
  }
  const apiKey = process.env.CURSOR_API_KEY;
  if (apiKey === undefined || apiKey.trim() === "") {
    console.error("Refusing live Cursor SDK validation: CURSOR_API_KEY is missing.");
    process.exit(2);
  }
  return apiKey;
}

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
}

function readEventType(event: unknown): string {
  if (typeof event !== "object" || event === null || !("type" in event)) {
    return "unknown";
  }
  const value = event.type;
  return typeof value === "string" ? value : "unknown";
}

function hasAsyncDispose(
  value: object,
): value is { [Symbol.asyncDispose]: () => PromiseLike<void> } {
  const dispose = Reflect.get(value, Symbol.asyncDispose);
  return typeof dispose === "function";
}

const apiKey = requireLiveOptIn();
const workRoot = await mkdtemp(join(tmpdir(), "aep-cursor-sdk-"));
console.log(`Disposable workspace: ${workRoot}`);

try {
  git(workRoot, ["init"]);
  git(workRoot, ["config", "user.email", "aep-validation@example.com"]);
  git(workRoot, ["config", "user.name", "AEP Validation"]);
  await writeFile(join(workRoot, "README.md"), "# AEP disposable validation repo\n", "utf8");
  git(workRoot, ["add", "README.md"]);
  git(workRoot, ["commit", "-m", "init disposable"]);

  const models = await Cursor.models.list({ apiKey });
  console.log(`models.list count=${models.length}`);
  if (models.length === 0) {
    throw new Error("Cursor.models.list returned an empty catalog");
  }

  const modelId = models[0]?.id;
  if (modelId === undefined || modelId === "") {
    throw new Error("First catalog model is missing an id");
  }
  console.log(`using model id length=${modelId.length} (id not printed)`);

  const agent = await Agent.create({
    apiKey,
    model: { id: modelId },
    local: {
      cwd: workRoot,
      sandboxOptions: { enabled: true },
    },
    tools: ["read", "grep", "glob", "ls"],
    disallowedTools: ["shell", "edit", "mcp", "task"],
  });

  try {
    console.log(`agent created id_prefix=${agent.agentId.slice(0, 8)}`);

    const run = await agent.send("Reply with exactly: AEP_SDK_OK. Do not use tools.");
    const started = Date.now();
    for await (const event of run.stream()) {
      console.log(`event.type=${readEventType(event)}`);
      if (Date.now() - started > 120_000) {
        await run.cancel();
        throw new Error("Live run exceeded 120s; cancelled");
      }
    }

    const result = await run.wait();
    console.log(`run.status=${result.status}`);
    console.log(`run.usage.inputTokens=${result.usage?.inputTokens ?? "n/a"}`);
    console.log(`run.usage.outputTokens=${result.usage?.outputTokens ?? "n/a"}`);

    try {
      const usage = await agent.getUsage();
      console.log(`getUsage.runs=${usage.runs?.length ?? 0}`);
      console.log(`getUsage.hasCost=${usage.cost !== undefined && usage.cost !== null}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      const safe = message.toLowerCase().includes("feature_unavailable")
        ? "feature_unavailable"
        : "error_redacted";
      console.log(`getUsage=${safe}`);
    }

    console.log("LIVE_VALIDATION_OK");
  } finally {
    if (hasAsyncDispose(agent)) {
      await agent[Symbol.asyncDispose]();
    }
  }
} finally {
  await rm(workRoot, { recursive: true, force: true });
}
