import type { AepApplication } from "./create-app.js";
import { ApplicationError } from "./errors.js";

export type RunStatusView = {
  readonly runId: string;
  readonly taskDescription: string;
  readonly status: string;
  readonly fixCycleCount: number;
  readonly executionId?: string;
  readonly agentId?: string;
  readonly lastResultText?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export function getRunStatus(app: AepApplication, runId: string): RunStatusView {
  const trimmed = runId.trim();
  if (trimmed.length === 0) {
    throw new ApplicationError("invalid_run_id", "run id must be non-empty");
  }
  const stored = app.runs.get(trimmed);
  if (stored === undefined) {
    throw new ApplicationError("run_not_found", `No run found for id ${trimmed}`);
  }
  return {
    runId: stored.runId,
    taskDescription: stored.taskDescription,
    status: stored.aggregate.run.status,
    fixCycleCount: stored.aggregate.run.fixCycleCount,
    ...(stored.executionId === undefined ? {} : { executionId: stored.executionId }),
    ...(stored.agentId === undefined ? {} : { agentId: stored.agentId }),
    ...(stored.lastResultText === undefined ? {} : { lastResultText: stored.lastResultText }),
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
  };
}
