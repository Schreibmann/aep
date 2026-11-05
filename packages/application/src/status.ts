import type { AepApplication } from "./create-app.js";
import { ApplicationError } from "./errors.js";
import { classifyRunForRecovery } from "./recovery.js";

export type RunStatusView = {
  readonly runId: string;
  readonly taskDescription: string;
  readonly status: string;
  readonly fixCycleCount: number;
  readonly executionLifecycle: string;
  readonly recoveryClassification: string;
  readonly executionId?: string;
  readonly agentId?: string;
  readonly lastResultText?: string;
  readonly recoveryOutcome?: string;
  readonly pendingApprovalKind?: string;
  readonly pendingApprovalHash?: string;
  readonly risk?: string;
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
  const classification = classifyRunForRecovery(stored);
  return {
    runId: stored.runId,
    taskDescription: stored.taskDescription,
    status: stored.aggregate.run.status,
    fixCycleCount: stored.aggregate.run.fixCycleCount,
    executionLifecycle: stored.executionLifecycle,
    recoveryClassification: classification.kind,
    ...(stored.executionId === undefined ? {} : { executionId: stored.executionId }),
    ...(stored.agentId === undefined ? {} : { agentId: stored.agentId }),
    ...(stored.lastResultText === undefined ? {} : { lastResultText: stored.lastResultText }),
    ...(stored.recoveryOutcome === undefined ? {} : { recoveryOutcome: stored.recoveryOutcome }),
    ...(stored.pendingApproval === undefined
      ? {}
      : {
          pendingApprovalKind: stored.pendingApproval.kind,
          pendingApprovalHash: stored.pendingApproval.subjectHash,
        }),
    ...(stored.policy === undefined ? {} : { risk: stored.policy.classification.risk }),
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
  };
}
