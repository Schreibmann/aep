/**
 * AEP-004 auth / catalog / usage capability probe.
 *
 * Safe default:
 *   pnpm validate:sdk:auth
 *
 * Live catalog path:
 *   AEP_LIVE_CURSOR_SDK=1 CURSOR_API_KEY=… pnpm validate:sdk:auth
 *   (CURSOR_API_KEY may also come from repo-root `.env`)
 */
import { Cursor } from "@cursor/sdk";
import { classifySdkErrorMessage, loadRepoEnvFile } from "./load-env.mts";

type AuthProbeResult = {
  keyPresent: boolean;
  liveOptIn: boolean;
  envFileLoaded: boolean;
  authStatus: "missing_key" | "ready_for_live" | "catalog_ok" | "catalog_failed";
  modelCount?: number;
  getUsageCapability?: "not_attempted" | "available" | "feature_unavailable" | "error_redacted";
  notes: string[];
};

const envLoad = loadRepoEnvFile();
const liveOptIn = process.env.AEP_LIVE_CURSOR_SDK === "1";
const apiKey = process.env.CURSOR_API_KEY;
const keyPresent = typeof apiKey === "string" && apiKey.trim() !== "";

const result: AuthProbeResult = {
  keyPresent,
  liveOptIn,
  envFileLoaded: envLoad.loaded,
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
    "Set CURSOR_API_KEY (env or .env) and AEP_LIVE_CURSOR_SDK=1 for live catalog/usage probes.",
  );
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = 2;
} else if (!liveOptIn) {
  result.authStatus = "ready_for_live";
  result.getUsageCapability = "not_attempted";
  result.notes.push("Key is present, but live calls are gated on AEP_LIVE_CURSOR_SDK=1.");
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
    result.notes.push(`catalog_error=${classifySdkErrorMessage(message)}`);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  }
}
