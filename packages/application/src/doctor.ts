import { spawnSync } from "node:child_process";
import { getAuthStatus } from "./auth-status.js";
import type { AepApplication } from "./create-app.js";
import { listAccountModels } from "./list-models.js";
import { listNonTerminalRuns } from "./recovery.js";
import { formatUsageDisplay } from "./usage-ledger.js";

export type DoctorCheck = {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
};

export type DoctorReport = {
  readonly ok: boolean;
  readonly checks: ReadonlyArray<DoctorCheck>;
};

function checkNode(): DoctorCheck {
  const version = process.versions.node;
  const major = Number(version.split(".")[0] ?? "0");
  const ok = major >= 22;
  return {
    name: "node",
    ok,
    detail: ok
      ? `Node.js ${version} (requires >= 22.13.0)`
      : `Node.js ${version} is below the Cursor SDK floor (>= 22.13.0)`,
  };
}

function checkGit(): DoctorCheck {
  const result = spawnSync("git", ["--version"], {
    encoding: "utf8",
    shell: false,
  });
  if (result.error !== undefined || result.status !== 0) {
    return {
      name: "git",
      ok: false,
      detail: "git executable not available on PATH",
    };
  }
  const detail = (result.stdout || result.stderr).trim();
  return {
    name: "git",
    ok: detail.length > 0,
    detail: detail.length > 0 ? detail : "git --version produced empty output",
  };
}

function checkOs(): DoctorCheck {
  return {
    name: "os",
    ok: true,
    detail: `${process.platform}-${process.arch}`,
  };
}

/**
 * Expanded doctor: host, auth, catalog, usage capability, recoveries.
 * Live Cursor SDK network checks remain opt-in.
 */
export async function runDoctor(app: AepApplication): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [checkNode(), checkGit(), checkOs()];

  const health = await app.runtime.checkAvailability();
  checks.push({
    name: "agent_runtime",
    ok: health.ok,
    detail: `${health.runtimeId}: ${health.detail}`,
  });
  checks.push({
    name: "sandbox_ready",
    ok: health.sandboxReady,
    detail: health.sandboxReady
      ? "runtime reports sandboxReady=true"
      : "runtime reports sandboxReady=false (fail closed for local agents)",
  });

  const auth = await getAuthStatus(app);
  checks.push({
    name: "auth_status",
    ok: auth.ok,
    detail: `${auth.runtimeId}; credentialConfigured=${auth.credentialConfigured}; billingOwner=${auth.billingOwner}; ${auth.detail}`,
  });

  try {
    const models = await listAccountModels(app);
    checks.push({
      name: "model_catalog",
      ok: models.models.length > 0,
      detail: `snapshot ${models.snapshotId}: ${models.models.length} model(s)`,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    checks.push({
      name: "model_catalog",
      ok: false,
      detail,
    });
  }

  const sampleUsage = await app.runtime.getUsage("__doctor_probe__");
  const usageView = formatUsageDisplay(sampleUsage);
  checks.push({
    name: "usage_metering",
    ok: true,
    detail: `probe status=${usageView.status} costLabel=${usageView.costLabel}; ${usageView.note}`,
  });

  checks.push({
    name: "sqlite",
    ok: false,
    detail: "CLI doctor does not open SQLite yet (persistence package exists; wiring later)",
  });

  const nonTerminal = listNonTerminalRuns(app);
  checks.push({
    name: "recoverable_runs",
    ok: true,
    detail:
      nonTerminal.length === 0
        ? "no non-terminal workflow runs"
        : `${nonTerminal.length} non-terminal run(s); use aep recoveries / aep resume`,
  });

  const ledgerCount = app.usage.list().length;
  checks.push({
    name: "usage_ledger",
    ok: true,
    detail:
      ledgerCount === 0
        ? "no usage ledger entries yet"
        : `${ledgerCount} usage ledger entr${ledgerCount === 1 ? "y" : "ies"} in memory`,
  });

  checks.push({
    name: "cursor_sdk_live",
    ok: false,
    detail: "live Cursor SDK checks are opt-in via validate:sdk:* (not imported by CLI)",
  });

  return {
    ok: checks.every(
      (check) => check.ok || check.name === "sqlite" || check.name === "cursor_sdk_live",
    ),
    checks,
  };
}
