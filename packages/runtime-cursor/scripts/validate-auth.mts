/**
 * AEP-004 auth / catalog / usage capability probe.
 *
 * Safe default (no network secrets printed):
 *   pnpm validate:sdk:auth
 *
 * Live billable path:
 *   AEP_LIVE_CURSOR_SDK=1 CURSOR_API_KEY=… pnpm validate:sdk:auth
 */
import { Cursor } from "@cursor/sdk";

type AuthProbeResult = {
  keyPresent: boolean;
  liveOptIn: boolean;
  authStatus: "missing_key" | "ready_for_live" | "catalog_ok" | "catalog_failed";
  modelCount?: number;
  getUsageCapability?: "not_attempted" | "available" | "feature_unavailable" | "error_redacted";
  notes: string[];
};

function redactMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("feature_unavailable")) {
    return "feature_unavailable";
  }
  if (lower.includes("unauthorized") || lower.includes("401") || lower.includes("403")) {
    return "auth_rejected";
  }
  return "error_redacted";
}

const liveOptIn = process.env.AEP_LIVE_CURSOR_SDK === "1";
const apiKey = process.env.CURSOR_API_KEY;
const keyPresent = typeof apiKey === "string" && apiKey.trim() !== "";

const result: AuthProbeResult = {
  keyPresent,
  liveOptIn,
  authStatus: "missing_key",
  notes: [
    "Never print CURSOR_API_KEY.",
    "Local agent loop is not local inference; models are Cursor-hosted.",
    "Third-party / extra-charge models stay disabled until explicit allowlist (ADR-011).",
  ],
};

if (!keyPresent) {
  result.authStatus = "missing_key";
  result.getUsageCapability = "not_attempted";
  result.notes.push(
    "Set CURSOR_API_KEY and AEP_LIVE_CURSOR_SDK=1 to run live catalog/usage probes.",
  );
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = 2;
} else if (!liveOptIn) {
  result.authStatus = "ready_for_live";
  result.getUsageCapability = "not_attempted";
  result.notes.push(
    "Key is present in the environment, but live calls are gated on AEP_LIVE_CURSOR_SDK=1.",
  );
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = 2;
} else {
  try {
    const models = await Cursor.models.list({ apiKey });
    result.modelCount = models.length;
    result.authStatus = "catalog_ok";
    result.notes.push("Catalog fetched; model ids are not printed in this probe.");
    result.getUsageCapability = "not_attempted";
    result.notes.push(
      "getUsage requires an agent run; use validate:sdk:live for billed/token evidence when approved.",
    );
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    result.authStatus = "catalog_failed";
    result.getUsageCapability = "error_redacted";
    const message = error instanceof Error ? error.message : "unknown";
    result.notes.push(`catalog_error=${redactMessage(message)}`);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  }
}
