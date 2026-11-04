import type { WorkflowRun } from "../entities.js";
import { createWorkflowRun } from "../entities.js";
import type { ProjectId, TaskId, WorkflowRunId } from "../ids.js";
import type { RoleId } from "../statuses.js";
import { createWorkflowLimits, type WorkflowLimits } from "./limits.js";

export type CompletionEvidence = {
  readonly planApproved: boolean;
  readonly gatesPassed: boolean;
  readonly reviewApproved: boolean;
  readonly scopeCheckPassed: boolean;
};

export type RoleExecutionCounts = Readonly<Record<RoleId, number>>;

export type WorkflowAggregate = {
  readonly run: WorkflowRun;
  readonly limits: WorkflowLimits;
  readonly roleExecutionCounts: RoleExecutionCounts;
  readonly activeWriterCount: number;
  readonly evidence: CompletionEvidence;
  readonly openFindingCount: number;
  readonly pendingGateNames: ReadonlyArray<string>;
};

export function createInitialWorkflowAggregate(input: {
  id: WorkflowRunId;
  taskId: TaskId;
  projectId: ProjectId;
  createdAt: string;
  limits?: WorkflowLimits;
}): WorkflowAggregate {
  const at = input.createdAt;
  return {
    run: createWorkflowRun({
      id: input.id,
      taskId: input.taskId,
      projectId: input.projectId,
      status: "created",
      fixCycleCount: 0,
      createdAt: at,
      updatedAt: at,
    }),
    limits: input.limits ?? createWorkflowLimits(),
    roleExecutionCounts: {
      planner: 0,
      implementer: 0,
      reviewer: 0,
    },
    activeWriterCount: 0,
    evidence: {
      planApproved: false,
      gatesPassed: false,
      reviewApproved: false,
      scopeCheckPassed: false,
    },
    openFindingCount: 0,
    pendingGateNames: [],
  };
}

export function hasRequiredCompletionEvidence(evidence: CompletionEvidence): boolean {
  return (
    evidence.planApproved &&
    evidence.gatesPassed &&
    evidence.reviewApproved &&
    evidence.scopeCheckPassed
  );
}
