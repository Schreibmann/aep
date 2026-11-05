import { reduceWorkflowAll } from "@aep/domain";
import { SafeCommandRunner } from "@aep/process";
import { tryLoadAepProjectConfig } from "@aep/project-profiles";
import {
  createGateCommandRegistry,
  type GateCommandRunner,
  type GateDefinition,
  type GateEngineResult,
  type GatePhase,
  loadGateDefinitions,
  QualityGatesError,
  runQualityGates,
} from "@aep/quality-gates";
import type { AepApplication } from "./create-app.js";
import { ApplicationError } from "./errors.js";
import type { StoredRun } from "./run-store.js";

export type RunGatesInput = {
  readonly runId: string;
  readonly cwd: string;
  readonly phase?: GatePhase | "all";
  /** Test seam; production uses SafeCommandRunner + gate registry. */
  readonly runner?: GateCommandRunner;
};

export type RunGatesResult = {
  readonly runId: string;
  readonly status: string;
  readonly gates: GateEngineResult;
};

/**
 * Run trusted project quality gates for a workflow run and persist evidence.
 * Failed mandatory gates set `gates.blocked` and, when the run is validating,
 * transition the workflow via gate_failed.
 */
export async function runGatesForRun(
  app: AepApplication,
  input: RunGatesInput,
): Promise<RunGatesResult> {
  const runId = input.runId.trim();
  if (runId.length === 0) {
    throw new ApplicationError("invalid_run_id", "run id must be non-empty");
  }
  const stored = app.runs.get(runId);
  if (stored === undefined) {
    throw new ApplicationError("run_not_found", `No run found for id ${runId}`);
  }

  const phase = input.phase ?? "fast";
  const config = tryLoadAepProjectConfig(input.cwd);
  let definitions: ReadonlyArray<GateDefinition>;
  try {
    definitions = loadGateDefinitions(
      input.cwd,
      config === undefined ? undefined : { approvedScriptNames: config.gates.approvedScriptNames },
    );
  } catch (error) {
    if (error instanceof QualityGatesError) {
      throw new ApplicationError(error.code, error.message);
    }
    throw error;
  }

  const runner = input.runner ?? new SafeCommandRunner(createGateCommandRegistry());
  let gates: GateEngineResult;
  try {
    gates = await runQualityGates({
      gates: definitions,
      cwd: input.cwd,
      phase,
      runner,
    });
  } catch (error) {
    if (error instanceof QualityGatesError) {
      throw new ApplicationError(error.code, error.message);
    }
    throw error;
  }

  const at = app.now();
  let aggregate = stored.aggregate;
  const status = stored.aggregate.run.status;
  if (status === "validating" || status === "final_validation") {
    const workflowEvents = [];
    // Start every gate first so the last pass does not leave validating early.
    for (const item of gates.evidence) {
      workflowEvents.push({ type: "gate_started" as const, at, name: item.gateId });
    }
    for (const item of gates.evidence) {
      if (item.status === "passed") {
        workflowEvents.push({ type: "gate_passed" as const, at, name: item.gateId });
      } else if (item.required) {
        workflowEvents.push({ type: "gate_failed" as const, at, name: item.gateId });
        break;
      }
    }
    aggregate = reduceWorkflowAll(aggregate, workflowEvents);
  }

  const next: StoredRun = {
    ...stored,
    aggregate,
    gateResults: gates,
    updatedAt: at,
  };
  app.runs.save(next);

  return {
    runId,
    status: aggregate.run.status,
    gates,
  };
}
