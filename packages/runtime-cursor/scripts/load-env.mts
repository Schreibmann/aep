import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Load KEY=VALUE pairs from the monorepo `.env` into process.env when unset.
 * Never logs values. Existing environment variables win.
 */
export function loadRepoEnvFile(): { loaded: boolean; path: string } {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = join(here, "..", "..", "..", ".env");
  if (!existsSync(envPath)) {
    return { loaded: false, path: envPath };
  }

  const text = readFileSync(envPath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key.length === 0) {
      continue;
    }
    const existing = process.env[key];
    if (existing === undefined || existing === "") {
      process.env[key] = value;
    }
  }

  return { loaded: true, path: envPath };
}

export function classifySdkErrorMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("sandboxing is not supported")) {
    return "sandbox_unsupported_on_host";
  }
  if (lower.includes("feature_unavailable")) {
    return "feature_unavailable";
  }
  if (lower.includes("unauthorized") || lower.includes("401") || lower.includes("403")) {
    return "auth_rejected";
  }
  if (lower.includes("configurationerror")) {
    return "configuration_error";
  }
  return "error_redacted";
}
