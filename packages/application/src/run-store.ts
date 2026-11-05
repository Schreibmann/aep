import type { PlannerPlan, ReviewReport } from "@aep/agent-profiles";
import type { ReviewAssurance, RoleId, WorkflowAggregate } from "@aep/domain";
import type { RunBudgetPolicy, RunBudgetState } from "@aep/model-routing";
import type { PendingApproval, RecordedApproval, RiskPolicyResult } from "@aep/policy";
import type { GateEngineResult } from "@aep/quality-gates";
import type { AgentToolPolicy, ModelParamSelection } from "@aep/runtime-contracts";

/**
 * Snapshot required to reattach a Cursor/Fake session after process restart.
 * Tool allowlist, system prompt, sandbox, cwd, and model MUST be reapplied on resume.
 */
export type ExecutionSnapshot = {
  readonly executionId: string;
  readonly opaqueAgentId: string;
  readonly roleId: RoleId;
  readonly modelId: string;
  readonly cwd: string;
  readonly systemPrompt?: string;
  readonly tools: AgentToolPolicy;
  readonly startedAt: string;
  readonly catalogSnapshotId?: string;
  readonly modelParams?: ReadonlyArray<ModelParamSelection>;
  readonly modelSelectionRationale?: string;
  /** True when the last attach used a fresh session instead of Agent.resume continuity. */
  readonly contextReset?: boolean;
  readonly contextResetReason?: string;
};

export type ExecutionLifecycle = "idle" | "running" | "settled";

export type RecoveryOutcome =
  | "resumed"
  | "marked_interrupted"
  | "cancelled"
  | "already_terminal"
  | "no_action";

export type StoredRun = {
  readonly runId: string;
  readonly taskDescription: string;
  readonly aggregate: WorkflowAggregate;
  readonly executionLifecycle: ExecutionLifecycle;
  readonly execution?: ExecutionSnapshot;
  /** Convenience mirrors of execution ids for status views. */
  readonly executionId?: string;
  readonly agentId?: string;
  readonly lastResultText?: string;
  /** Validated Planner plan (AEP-050); set only after schema acceptance. */
  readonly plan?: PlannerPlan;
  readonly plannerProfileVersionHash?: string;
  readonly planSchemaVersion?: string;
  /** Deterministic risk/policy evaluation (AEP-051). */
  readonly policy?: RiskPolicyResult;
  /** Pending human approval bound to a subject hash (AEP-052). */
  readonly pendingApproval?: PendingApproval;
  readonly approvals?: ReadonlyArray<RecordedApproval>;
  /** Quality gate evidence for Reviewer / reports (AEP-053). */
  readonly gateResults?: GateEngineResult;
  /** Structured Reviewer report (AEP-054). */
  readonly reviewReport?: ReviewReport;
  readonly reviewAssurance?: ReviewAssurance;
  readonly reviewModelId?: string;
  /** Per-run budget tracker (AEP-056). */
  readonly budget?: RunBudgetState;
  readonly budgetPolicy?: RunBudgetPolicy;
  readonly recoveryOutcome?: RecoveryOutcome;
  readonly createdAt: string;
  readonly updatedAt: string;
};

/**
 * In-memory run store. Survives "process restart" in tests by reusing the same instance
 * or by cloning via {@link InMemoryRunStore.fromSnapshot}.
 */
export class InMemoryRunStore {
  private readonly runs = new Map<string, StoredRun>();

  save(run: StoredRun): void {
    this.runs.set(run.runId, run);
  }

  get(runId: string): StoredRun | undefined {
    return this.runs.get(runId);
  }

  list(): ReadonlyArray<StoredRun> {
    return [...this.runs.values()];
  }

  snapshot(): ReadonlyArray<StoredRun> {
    return this.list().map((run) => ({ ...run }));
  }

  static fromSnapshot(runs: ReadonlyArray<StoredRun>): InMemoryRunStore {
    const store = new InMemoryRunStore();
    for (const run of runs) {
      store.save(run);
    }
    return store;
  }
}
