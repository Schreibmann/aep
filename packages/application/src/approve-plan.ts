import { reduceWorkflowAll } from "@aep/domain";
import {
  checkSubjectHashUnchanged,
  hashApprovalSubject,
  type PendingApproval,
  type RecordedApproval,
} from "@aep/policy";
import type { AepApplication } from "./create-app.js";
import { ApplicationError } from "./errors.js";
import type { StoredRun } from "./run-store.js";

export type DecideApprovalInput = {
  readonly runId: string;
  readonly decision: "allow" | "deny";
  readonly decidedBy: string;
  readonly rationale: string;
  /**
   * When true (default for CLI --json / non-TTY), missing explicit decision is already
   * handled by the caller; this flag documents interactive vs non-interactive intent.
   */
  readonly nonInteractive?: boolean;
};

export type DecideApprovalResult = {
  readonly runId: string;
  readonly status: string;
  readonly approval: RecordedApproval;
};

function requirePendingPlan(stored: StoredRun): {
  readonly pending: PendingApproval;
  readonly planHash: string;
} {
  if (stored.plan === undefined) {
    throw new ApplicationError("plan_missing", "Run has no validated plan to approve");
  }
  if (stored.pendingApproval === undefined) {
    throw new ApplicationError(
      "approval_not_pending",
      "Run has no pending approval (already decided or blocked)",
    );
  }
  if (stored.pendingApproval.kind !== "plan") {
    throw new ApplicationError(
      "approval_kind_mismatch",
      `Expected plan approval, found ${stored.pendingApproval.kind}`,
    );
  }
  const planHash = hashApprovalSubject(stored.plan);
  const binding = checkSubjectHashUnchanged(stored.pendingApproval.subjectHash, planHash);
  if (!binding.ok) {
    throw new ApplicationError(binding.code, binding.message);
  }
  return { pending: stored.pendingApproval, planHash };
}

/**
 * Record a human decision for the pending plan approval.
 * Replays against a changed plan hash are rejected.
 */
export function decidePlanApproval(
  app: AepApplication,
  input: DecideApprovalInput,
): DecideApprovalResult {
  const runId = input.runId.trim();
  if (runId.length === 0) {
    throw new ApplicationError("invalid_run_id", "run id must be non-empty");
  }
  const decidedBy = input.decidedBy.trim();
  if (decidedBy.length === 0) {
    throw new ApplicationError("invalid_approver", "Approver must be non-empty");
  }
  const rationale = input.rationale.trim();
  if (rationale.length === 0) {
    throw new ApplicationError("invalid_rationale", "Approval rationale must be non-empty");
  }

  const stored = app.runs.get(runId);
  if (stored === undefined) {
    throw new ApplicationError("run_not_found", `No run found for id ${runId}`);
  }
  if (stored.aggregate.run.status !== "awaiting_plan_approval") {
    throw new ApplicationError(
      "invalid_run_status",
      `Run status is ${stored.aggregate.run.status}, expected awaiting_plan_approval`,
    );
  }

  const { pending, planHash } = requirePendingPlan(stored);

  if (input.decision === "allow") {
    if (stored.policy !== undefined && !stored.policy.requirements.allowAgentWriteExecution) {
      throw new ApplicationError(
        "policy_denies_write",
        "Policy forbids agent write execution for this risk; plan cannot be approved for implementation",
      );
    }
  }

  const at = app.now();
  const approval: RecordedApproval = {
    id: app.createId("approval"),
    runId,
    kind: "plan",
    subjectHash: planHash,
    decision: input.decision,
    decidedBy,
    rationale,
    scope: pending.scope,
    createdAt: at,
  };

  const aggregate = reduceWorkflowAll(stored.aggregate, [
    input.decision === "allow"
      ? { type: "plan_approved", at, decidedBy }
      : { type: "plan_rejected", at, decidedBy },
  ]);

  const { pendingApproval: _clearedPending, ...rest } = stored;
  const next: StoredRun = {
    ...rest,
    aggregate,
    approvals: [...(stored.approvals ?? []), approval],
    updatedAt: at,
  };
  app.runs.save(next);

  return {
    runId,
    status: aggregate.run.status,
    approval,
  };
}

/**
 * Non-interactive guard used by CLI when no --approve/--reject was provided.
 */
export function requireExplicitApprovalDecision(hasDecision: boolean): void {
  if (!hasDecision) {
    throw new ApplicationError(
      "approval_required",
      "Non-interactive mode requires --approve or --reject",
    );
  }
}
