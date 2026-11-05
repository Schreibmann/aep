export type { DecideApprovalInput, DecideApprovalResult } from "./approve-plan.ts";
export { decidePlanApproval, requireExplicitApprovalDecision } from "./approve-plan.ts";
export type { AuthStatusReport, BillingOwnerHint } from "./auth-status.ts";
export { getAuthStatus } from "./auth-status.ts";
export {
  beginRoleUnderBudget,
  budgetPolicyOrDefault,
  budgetStateOrEmpty,
  finishRoleUsage,
} from "./budget.ts";
export type { AepApplication, AppDependencies } from "./create-app.ts";
export { createApp } from "./create-app.ts";
export type { DoctorCheck, DoctorReport } from "./doctor.ts";
export { runDoctor } from "./doctor.ts";
export { ApplicationError } from "./errors.ts";
export type {
  FixCycleReport,
  FixCycleStopReason,
  RunFixCycleInput,
} from "./fix-cycle.ts";
export { runBoundedFixCycle } from "./fix-cycle.ts";
export type { InitProjectInput, InitProjectResult } from "./init-project.ts";
export { initProject } from "./init-project.ts";
export {
  assembleProjectKnowledgeContext,
  buildProjectKnowledgePacks,
  editProjectKnowledgePack,
  listProjectKnowledgePacks,
} from "./knowledge.ts";

export type { ListedModel, ModelsReport } from "./list-models.ts";
export { listAccountModels } from "./list-models.ts";
export type {
  PrepareWorkspaceInput,
  PrepareWorkspaceResult,
} from "./prepare-workspace.ts";
export { prepareWorkspace } from "./prepare-workspace.ts";
export type {
  RecoveryClassification,
  ResumeRunInput,
  ResumeRunResult,
} from "./recovery.ts";
export { classifyRunForRecovery, listNonTerminalRuns, resumeRun } from "./recovery.ts";
export type { RunGatesInput, RunGatesResult } from "./run-gates.ts";
export { runGatesForRun } from "./run-gates.ts";
export type { RunImplementInput, RunImplementResult } from "./run-implement.ts";
export { runImplementer } from "./run-implement.ts";
export type { RunReviewInput, RunReviewResult } from "./run-review.ts";
export { runReview } from "./run-review.ts";
export type {
  ExecutionLifecycle,
  ExecutionSnapshot,
  RecoveryOutcome,
  StoredRun,
} from "./run-store.ts";
export { InMemoryRunStore } from "./run-store.ts";
export type { RunTaskInput, RunTaskResult } from "./run-task.ts";
export { runTask } from "./run-task.ts";
export { findOutOfScopePaths } from "./scope-check.ts";
export type { RunStatusView } from "./status.ts";
export { getRunStatus } from "./status.ts";
export type {
  UsageDisplay,
  UsageLedgerEntry,
  UsageSource,
} from "./usage-ledger.ts";
export {
  formatUsageDisplay,
  InMemoryUsageLedger,
  redactProviderError,
} from "./usage-ledger.ts";
