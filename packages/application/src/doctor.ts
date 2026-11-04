import { spawnSync } from "node:child_process";
import type { AepApplication } from "./create-app.js";
import { listNonTerminalRuns } from "./recovery.js";

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
 * Initial doctor skeleton: local host + injected runtime health.
 * Cursor SDK auth/catalog/DB details arrive in later tasks.
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

  const catalog = await app.runtime.discoverModels();
  checks.push({
    name: "model_catalog",
    ok: catalog.models.length > 0,
    detail: `${catalog.models.length} model(s) in runtime catalog snapshot`,
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
