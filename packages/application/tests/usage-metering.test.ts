import { createFeatureUnavailableUsage, FakeAgentRuntime } from "@aep/runtime-contracts";
import { describe, expect, it } from "vitest";
import { getAuthStatus } from "../src/auth-status.ts";
import { createApp } from "../src/create-app.ts";
import { listAccountModels } from "../src/list-models.ts";
import { runTask } from "../src/run-task.ts";
import { formatUsageDisplay, redactProviderError } from "../src/usage-ledger.ts";

describe("AEP-044 usage metering and diagnostics", () => {
  it("never displays unknown cost as $0", () => {
    const unknown = formatUsageDisplay({
      status: "unknown",
      costStatus: "unknown",
      tokens: { inputTokens: 3, outputTokens: 2 },
    });
    expect(unknown.costLabel).toBe("unknown");
    expect(unknown.costLabel).not.toContain("$0");
    expect(unknown.billedUsd).toBeUndefined();

    const unavailable = formatUsageDisplay(createFeatureUnavailableUsage({ inputTokens: 1 }));
    expect(unavailable.status).toBe("feature_unavailable");
    expect(unavailable.costLabel).toBe("unknown");

    const reported = formatUsageDisplay({
      status: "ok",
      costStatus: "provider_reported",
      tokens: { inputTokens: 1 },
      billedUsd: 0.12,
    });
    expect(reported.billedUsd).toBe(0.12);
    expect(reported.costLabel).toContain("0.12");
  });

  it("redacts API keys from provider errors", () => {
    const redacted = redactProviderError(
      "failed CURSOR_API_KEY=sk-abcdefghijklmnopqrstuvwxyz Bearer tok_secret_value api_key=abc123",
    );
    expect(redacted).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
    expect(redacted).toContain("[REDACTED]");
    expect(redacted).not.toContain("tok_secret_value");
  });

  it("records usage after runTask without inventing dollars", async () => {
    const runtime = new FakeAgentRuntime();
    const app = createApp({
      runtime,
      now: () => "2026-11-05T15:00:00.000Z",
      createId: (prefix) => `${prefix}_u`,
    });
    const result = await runTask(app, { task: "plan", cwd: "/tmp" });
    const entries = app.usage.listByExecution(result.executionId);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.usage.costStatus).toBe("unknown");
    expect(entries[0]?.source).toBe("cursor_sdk_get_usage");
  });

  it("lists models and auth status safely", async () => {
    const app = createApp();
    const models = await listAccountModels(app);
    expect(models.snapshotId.length).toBeGreaterThan(0);
    expect(models.models[0]?.id).toBe("fake-model");

    const auth = await getAuthStatus(app);
    expect(auth.runtimeId).toBe("fake");
    expect(auth.detail.toLowerCase()).not.toContain("sk-");
    expect(auth.billingOwner).toBe("unknown");
  });
});
