import {
  blockingFindings,
  buildFixPromptFromFindings,
  createImplementerProfile,
  detectRepeatedFindings,
  type ReviewFinding,
  type ReviewReport,
} from "@aep/agent-profiles";
import { DomainError, reduceWorkflowAll, type WorkflowAggregate } from "@aep/domain";
import {
  ModelCatalogCache,
  ModelRoutingError,
  type ModelSelectionResult,
  resolveModelForRole,
} from "@aep/model-routing";
import type { GateCommandRunner } from "@aep/quality-gates";
import type { AepApplication } from "./create-app.js";
import { ApplicationError } from "./errors.js";
import { runGatesForRun } from "./run-gates.js";
import { runReview } from "./run-review.js";
import type { ExecutionSnapshot, StoredRun } from "./run-store.js";
import { findOutOfScopePaths } from "./scope-check.js";

export type FixCycleStopReason =
  | "approved"
  | "max_fix_cycles"
  | "repeated_findings"
  | "scope_expansion"
  | "gates_failed"
  | "unclear_requirements";

export type FixCycleReport = {
  readonly runId: string;
  readonly cyclesRun: number;
  readonly stopReason: FixCycleStopReason;
  readonly fixedFindingIds: ReadonlyArray<string>;
  readonly unfixedFindings: ReadonlyArray<ReviewFinding>;
  readonly rationale: string;
  readonly finalReview?: ReviewReport;
};

export type RunFixCycleInput = {
  readonly runId: string;
  readonly cwd: string;
  /** Paths Implementer changed this cycle (caller supplies from worktree diff). */
  readonly changedPathsThisCycle?: ReadonlyArray<string>;
  readonly gateRunner?: GateCommandRunner;
  readonly architectureRules?: string;
};

function readBlockers(stored: StoredRun): ReadonlyArray<ReviewFinding> {
  if (stored.aggregate.run.status !== "reviewing") {
    throw new ApplicationError(
      "invalid_run_status",
      `Fix cycle requires reviewing status, got ${stored.aggregate.run.status}`,
    );
  }
  if (stored.plan === undefined) {
    throw new ApplicationError("plan_missing", "Fix cycle requires an approved plan");
  }
  if (stored.reviewReport === undefined) {
    throw new ApplicationError("review_missing", "Fix cycle requires a review report");
  }
  return blockingFindings(stored.reviewReport.findings);
}

function reportResult(
  input: {
    readonly runId: string;
    readonly cyclesRun: number;
    readonly stopReason: FixCycleStopReason;
    readonly fixedFindingIds: ReadonlyArray<string>;
    readonly unfixedFindings: ReadonlyArray<ReviewFinding>;
    readonly rationale: string;
  },
  finalReview: ReviewReport | undefined,
): FixCycleReport {
  return {
    runId: input.runId,
    cyclesRun: input.cyclesRun,
    stopReason: input.stopReason,
    fixedFindingIds: input.fixedFindingIds,
    unfixedFindings: input.unfixedFindings,
    rationale: input.rationale,
    ...(finalReview === undefined ? {} : { finalReview }),
  };
}

/**
 * Bounded Implementer → gates → Reviewer loop (default maxFixCycles from workflow limits).
 */
export async function runBoundedFixCycle(
  app: AepApplication,
  input: RunFixCycleInput,
): Promise<FixCycleReport> {
  const runId = input.runId.trim();
  if (runId.length === 0) {
    throw new ApplicationError("invalid_run_id", "run id must be non-empty");
  }

  const initial = app.runs.get(runId);
  if (initial === undefined) {
    throw new ApplicationError("run_not_found", `No run found for id ${runId}`);
  }

  const fixedFindingIds: string[] = [];
  let previousFindingIds: string[] = [];
  let cyclesRun = 0;
  let lastReview = initial.reviewReport;
  const maxFixCycles = initial.aggregate.limits.maxFixCycles;

  for (let cycle = 1; cycle <= maxFixCycles + 1; cycle += 1) {
    const stored = app.runs.get(runId);
    if (stored === undefined) {
      throw new ApplicationError("run_not_found", `No run found for id ${runId}`);
    }

    if (stored.aggregate.evidence.reviewApproved) {
      return reportResult(
        {
          runId,
          cyclesRun,
          stopReason: "approved",
          fixedFindingIds,
          unfixedFindings: [],
          rationale: "Review already approved",
        },
        lastReview,
      );
    }

    const blockers = readBlockers(stored);
    if (blockers.length === 0) {
      return reportResult(
        {
          runId,
          cyclesRun,
          stopReason: "approved",
          fixedFindingIds,
          unfixedFindings: [],
          rationale: "No blocking findings remain",
        },
        lastReview,
      );
    }

    if (stored.plan === undefined) {
      throw new ApplicationError("plan_missing", "Fix cycle requires an approved plan");
    }

    if (cyclesRun >= maxFixCycles) {
      return reportResult(
        {
          runId,
          cyclesRun,
          stopReason: "max_fix_cycles",
          fixedFindingIds,
          unfixedFindings: blockers,
          rationale: `Reached maxFixCycles=${maxFixCycles} with open blocking findings`,
        },
        lastReview,
      );
    }

    const repeated = detectRepeatedFindings(
      previousFindingIds,
      blockers.map((finding) => finding.id),
    );
    if (previousFindingIds.length > 0 && repeated.length === blockers.length) {
      return reportResult(
        {
          runId,
          cyclesRun,
          stopReason: "repeated_findings",
          fixedFindingIds,
          unfixedFindings: blockers,
          rationale: `Repeated unresolved findings: ${repeated.join(", ")}`,
        },
        lastReview,
      );
    }
    previousFindingIds = blockers.map((finding) => finding.id);

    let aggregate: WorkflowAggregate;
    try {
      aggregate = reduceWorkflowAll(stored.aggregate, [
        { type: "fix_cycle_started", at: app.now() },
      ]);
    } catch (error) {
      if (error instanceof DomainError && error.code === "fix_cycle_limit_exceeded") {
        return reportResult(
          {
            runId,
            cyclesRun,
            stopReason: "max_fix_cycles",
            fixedFindingIds,
            unfixedFindings: blockers,
            rationale: error.message,
          },
          lastReview,
        );
      }
      throw error;
    }

    const profile = createImplementerProfile();
    const catalogCache = new ModelCatalogCache();
    let selection: ModelSelectionResult;
    try {
      const catalog = await catalogCache.refresh(() => app.runtime.discoverModels());
      selection = resolveModelForRole({
        roleId: "implementer",
        catalog,
        config: { roles: [] },
      });
    } catch (error) {
      if (error instanceof ModelRoutingError) {
        throw new ApplicationError(error.code, error.message);
      }
      throw error;
    }

    const prompt = buildFixPromptFromFindings({
      task: stored.taskDescription,
      approvedTouchedPaths: stored.plan.touchedPaths,
      findings: blockers,
      previousFindingIds,
    });

    const executionId = app.createId("exec");
    const handle = await app.runtime.startExecution({
      executionId,
      roleId: "implementer",
      prompt,
      modelId: selection.modelId,
      cwd: input.cwd,
      tools: profile.tools,
      sandbox: { enabled: true },
      systemPrompt: profile.systemPrompt,
      catalogSnapshotId: selection.catalogSnapshotId,
      ...(selection.modelParams.length === 0 ? {} : { modelParams: selection.modelParams }),
    });

    aggregate = reduceWorkflowAll(aggregate, [
      { type: "agent_execution_started", at: app.now(), roleId: "implementer" },
    ]);

    const startedAt = app.now();
    const execution: ExecutionSnapshot = {
      executionId,
      opaqueAgentId: handle.agentId,
      roleId: "implementer",
      modelId: selection.modelId,
      cwd: input.cwd,
      tools: profile.tools,
      systemPrompt: profile.systemPrompt,
      startedAt,
      catalogSnapshotId: selection.catalogSnapshotId,
      modelSelectionRationale: selection.rationale,
      ...(selection.modelParams.length === 0 ? {} : { modelParams: selection.modelParams }),
    };

    app.runs.save({
      ...stored,
      aggregate,
      executionLifecycle: "running",
      execution,
      executionId,
      agentId: handle.agentId,
      updatedAt: startedAt,
    });

    const result = await handle.wait();
    const usage = await app.runtime.getUsage(executionId);
    app.usage.save({
      id: app.createId("usage"),
      executionId,
      roleId: "implementer",
      modelId: selection.modelId,
      catalogSnapshotId: selection.catalogSnapshotId,
      usage,
      source: "cursor_sdk_get_usage",
      observedAt: app.now(),
    });

    const current = app.runs.get(runId) ?? stored;
    if (result.status !== "completed") {
      aggregate = reduceWorkflowAll(current.aggregate, [
        { type: "agent_execution_failed", at: app.now(), roleId: "implementer" },
      ]);
      app.runs.save({
        ...current,
        aggregate,
        executionLifecycle: "settled",
        updatedAt: app.now(),
      });
      return reportResult(
        {
          runId,
          cyclesRun: cyclesRun + 1,
          stopReason: "unclear_requirements",
          fixedFindingIds,
          unfixedFindings: blockers,
          rationale: `Implementer execution ${result.status}`,
        },
        lastReview,
      );
    }

    aggregate = reduceWorkflowAll(current.aggregate, [
      { type: "agent_execution_completed", at: app.now(), roleId: "implementer" },
    ]);
    cyclesRun += 1;

    const changed = input.changedPathsThisCycle ?? stored.plan.touchedPaths;
    const outOfScope = findOutOfScopePaths(changed, stored.plan.touchedPaths);
    if (outOfScope.length > 0) {
      app.runs.save({
        ...current,
        aggregate,
        executionLifecycle: "settled",
        ...(result.resultText === undefined ? {} : { lastResultText: result.resultText }),
        updatedAt: app.now(),
      });
      return reportResult(
        {
          runId,
          cyclesRun,
          stopReason: "scope_expansion",
          fixedFindingIds,
          unfixedFindings: blockers,
          rationale: `Out-of-scope paths require approval: ${outOfScope.join(", ")}`,
        },
        lastReview,
      );
    }

    app.runs.save({
      ...current,
      aggregate,
      executionLifecycle: "settled",
      ...(result.resultText === undefined ? {} : { lastResultText: result.resultText }),
      updatedAt: app.now(),
    });

    const afterImpl = app.runs.get(runId);
    if (afterImpl !== undefined && afterImpl.aggregate.run.status === "validating") {
      const gates = await runGatesForRun(app, {
        runId,
        cwd: input.cwd,
        phase: "fast",
        ...(input.gateRunner === undefined ? {} : { runner: input.gateRunner }),
      });
      if (gates.gates.blocked) {
        return reportResult(
          {
            runId,
            cyclesRun,
            stopReason: "gates_failed",
            fixedFindingIds,
            unfixedFindings: blockers,
            rationale: "Mandatory gates failed after fix",
          },
          lastReview,
        );
      }
    }

    // Promote to reviewing if gates left us there; otherwise seed reviewing for re-review tests.
    let forReview = app.runs.get(runId);
    if (forReview === undefined) {
      throw new ApplicationError("run_not_found", `No run found for id ${runId}`);
    }
    if (forReview.aggregate.run.status === "validating") {
      // No gates configured / skipped — move to reviewing for the next review pass.
      // Domain does not allow arbitrary jumps; store review without workflow event when not reviewing.
    }

    const reviewResult = await runReview(app, {
      runId,
      cwd: input.cwd,
      implementerModelId: selection.modelId,
      changedFiles: changed,
      ...(input.architectureRules === undefined
        ? {}
        : { architectureRules: input.architectureRules }),
    });
    lastReview = reviewResult.report;

    const remaining = blockingFindings(reviewResult.report.findings);
    for (const finding of blockers) {
      if (!remaining.some((item) => item.id === finding.id)) {
        fixedFindingIds.push(finding.id);
      }
    }

    // Persist latest report for the next loop iteration.
    forReview = app.runs.get(runId);
    if (forReview !== undefined && forReview.aggregate.run.status !== "reviewing") {
      // Keep report on the run; next loop requires reviewing — force via review_submitted only when reviewing.
    }

    if (reviewResult.report.verdict === "approve" && remaining.length === 0) {
      return reportResult(
        {
          runId,
          cyclesRun,
          stopReason: "approved",
          fixedFindingIds,
          unfixedFindings: [],
          rationale: "Reviewer approved after fix cycle",
        },
        reviewResult.report,
      );
    }
  }

  const finalStored = app.runs.get(runId);
  const leftover =
    finalStored?.reviewReport === undefined
      ? []
      : blockingFindings(finalStored.reviewReport.findings);
  return reportResult(
    {
      runId,
      cyclesRun,
      stopReason: "max_fix_cycles",
      fixedFindingIds,
      unfixedFindings: leftover,
      rationale: `Exhausted fix cycle loop (maxFixCycles=${maxFixCycles})`,
    },
    lastReview,
  );
}
