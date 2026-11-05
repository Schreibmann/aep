import {
  type AepApplication,
  formatUsageDisplay,
  getRunStatus,
  redactProviderError,
  type StoredRun,
} from "@aep/application";

export type SafeTimelineEvent = {
  readonly id: string;
  readonly at: string;
  readonly kind: string;
  readonly text: string;
};

function safeText(value: string): string {
  return redactProviderError(value).slice(0, 500);
}

/**
 * Project a safe, non-secret timeline from stored run state (no hidden reasoning).
 */
export function projectRunTimeline(run: StoredRun): ReadonlyArray<SafeTimelineEvent> {
  const events: SafeTimelineEvent[] = [];
  const push = (kind: string, at: string, text: string) => {
    events.push({
      id: `${run.runId}:${events.length}:${kind}`,
      at,
      kind,
      text: safeText(text),
    });
  };

  push("run_created", run.createdAt, `Run created: ${run.taskDescription}`);
  push("status", run.updatedAt, `Status: ${run.aggregate.run.status}`);

  if (run.execution !== undefined) {
    push(
      "role_stage",
      run.execution.startedAt,
      `Role ${run.execution.roleId} on model ${run.execution.modelId} (lifecycle=${run.executionLifecycle})`,
    );
  }

  if (run.pendingApproval !== undefined) {
    push(
      "approval_pending",
      run.pendingApproval.createdAt,
      `Pending ${run.pendingApproval.kind} approval (hash=${run.pendingApproval.subjectHash.slice(0, 12)})`,
    );
  }

  for (const approval of run.approvals ?? []) {
    push(
      "approval",
      approval.createdAt,
      `${approval.decision} ${approval.kind} by ${approval.decidedBy}`,
    );
  }

  for (const gate of run.gateResults?.evidence ?? []) {
    push(
      "gate",
      run.updatedAt,
      `Gate ${gate.gateId}: ${gate.status} (exit=${gate.exitCode ?? "n/a"})`,
    );
  }

  if (run.reviewReport !== undefined) {
    push(
      "review",
      run.updatedAt,
      `Review ${run.reviewReport.verdict}; findings=${run.reviewReport.findings.length}`,
    );
    for (const finding of run.reviewReport.findings.slice(0, 20)) {
      push("review_finding", run.updatedAt, `${finding.severity}: ${finding.title}`);
    }
  }

  if (run.worktreePath !== undefined) {
    push("worktree", run.updatedAt, `Worktree ${run.worktreeBranch ?? ""} @ ${run.worktreePath}`);
  }

  if (run.budget !== undefined) {
    push(
      "budget",
      run.updatedAt,
      `Budget roleExecutions=${run.budget.totalRoleExecutions}; unknownCost=${run.budget.unknownCostObserved}`,
    );
  }

  return events;
}

export function listRunSummaries(
  app: AepApplication,
): ReadonlyArray<ReturnType<typeof getRunStatus>> {
  return app.runs.list().map((run) => getRunStatus(app, run.runId));
}

export function listUsageForRun(app: AepApplication, run: StoredRun) {
  const executionId = run.executionId;
  const entries = executionId === undefined ? [] : app.usage.listByExecution(executionId);
  // Also include any ledger rows whose execution matches historical snapshots.
  const related =
    entries.length > 0
      ? entries
      : app.usage.list().filter((entry) => entry.executionId === run.execution?.executionId);
  return related.map((entry) => ({
    id: entry.id,
    executionId: entry.executionId,
    roleId: entry.roleId,
    modelId: entry.modelId,
    source: entry.source,
    observedAt: entry.observedAt,
    display: formatUsageDisplay(entry.usage),
  }));
}

export function listWorktreesFromRuns(app: AepApplication) {
  return app.runs
    .list()
    .filter((run) => run.worktreePath !== undefined)
    .map((run) => ({
      runId: run.runId,
      path: run.worktreePath,
      branch: run.worktreeBranch,
      status: run.aggregate.run.status,
    }));
}
