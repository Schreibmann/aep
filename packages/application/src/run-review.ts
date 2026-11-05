import {
  blockingFindings,
  buildReviewerUserPrompt,
  buildReviewRepairPrompt,
  createReviewerProfile,
  parseReviewReportWithBoundedRetry,
  type ReviewReport,
  withReviewAssurance,
} from "@aep/agent-profiles";
import { type ReviewAssurance, reduceWorkflowAll } from "@aep/domain";
import {
  ModelCatalogCache,
  ModelRoutingError,
  type ModelSelectionResult,
  resolveModelForRole,
} from "@aep/model-routing";
import { resolveReactTsViteProfile } from "@aep/project-profiles";
import { assertReviewerReadOnly } from "@aep/security";
import type { AepApplication } from "./create-app.js";
import { ApplicationError } from "./errors.js";
import type { ExecutionSnapshot, StoredRun } from "./run-store.js";

function architectureRulesForCwd(cwd: string, explicit?: string): string {
  if (explicit !== undefined && explicit.trim().length > 0) {
    return explicit;
  }
  try {
    const profile = resolveReactTsViteProfile(cwd);
    const checklist = profile.checklistText.trim();
    if (checklist.length > 0) {
      return `Follow AEP security and scope rules.\n\n${checklist}`;
    }
  } catch {
    // Project may not be a Node package; fall through.
  }
  return "Follow AEP security and scope rules.";
}

export type RunReviewInput = {
  readonly runId: string;
  readonly cwd: string;
  /** Implementer model id to prefer a different reviewer model when available. */
  readonly implementerModelId?: string;
  readonly changedFiles?: ReadonlyArray<string>;
  readonly diffSummary?: string;
  readonly architectureRules?: string;
};

export type RunReviewResult = {
  readonly runId: string;
  readonly status: string;
  readonly executionId: string;
  readonly agentId: string;
  readonly modelId: string;
  readonly reviewAssurance: ReviewAssurance;
  readonly report: ReviewReport;
  readonly openBlockingFindings: number;
};

function assuranceFromSelection(selection: ModelSelectionResult): ReviewAssurance {
  if (selection.assuranceNote === "same_model_fresh_session") {
    return "same_model_fresh_session";
  }
  if (selection.rationale.startsWith("reviewer_different_model:")) {
    return "different_model_fresh_session";
  }
  if (selection.rationale.includes("same_model_fresh_session")) {
    return "same_model_fresh_session";
  }
  return "same_model_fresh_session";
}

/**
 * Fresh Reviewer session: read-only tools, structured report, bounded retry.
 * Does not resume Implementer transcript (always startExecution).
 */
export async function runReview(
  app: AepApplication,
  input: RunReviewInput,
): Promise<RunReviewResult> {
  const runId = input.runId.trim();
  if (runId.length === 0) {
    throw new ApplicationError("invalid_run_id", "run id must be non-empty");
  }
  const stored = app.runs.get(runId);
  if (stored === undefined) {
    throw new ApplicationError("run_not_found", `No run found for id ${runId}`);
  }
  if (stored.plan === undefined) {
    throw new ApplicationError("plan_missing", "Review requires a validated plan");
  }

  const profile = createReviewerProfile();
  assertReviewerReadOnly(profile.tools);

  const health = await app.runtime.checkAvailability();
  if (!health.ok || !health.sandboxReady) {
    throw new ApplicationError("runtime_unavailable", `Agent runtime not ready: ${health.detail}`);
  }

  const catalogCache = new ModelCatalogCache();
  let selection: ModelSelectionResult;
  try {
    const catalog = await catalogCache.refresh(() => app.runtime.discoverModels());
    selection = resolveModelForRole({
      roleId: "reviewer",
      catalog,
      config: {
        roles: [
          {
            roleId: "reviewer",
            preferredModelIds: [],
            ...(input.implementerModelId === undefined
              ? {}
              : { preferDifferentFromModelId: input.implementerModelId }),
          },
        ],
      },
    });
  } catch (error) {
    if (error instanceof ModelRoutingError) {
      throw new ApplicationError(error.code, error.message);
    }
    throw error;
  }

  const reviewAssurance = assuranceFromSelection(selection);
  const gateEvidenceJson = JSON.stringify(stored.gateResults?.evidence ?? []);
  const userPrompt = buildReviewerUserPrompt({
    task: stored.taskDescription,
    approvedPlanJson: JSON.stringify(stored.plan),
    changedFiles: input.changedFiles ?? stored.plan.touchedPaths,
    diffSummary: input.diffSummary ?? "(diff not attached; inspect changed files with read tools)",
    gateEvidenceJson,
    architectureRules: architectureRulesForCwd(input.cwd, input.architectureRules),
  });

  let activeExecutionId = app.createId("exec");
  const priorAgentId = stored.agentId;

  const parsed = await parseReviewReportWithBoundedRetry({
    runtime: app.runtime,
    maxAttempts: 2,
    start: async () => {
      const handle = await app.runtime.startExecution({
        executionId: activeExecutionId,
        roleId: "reviewer",
        prompt: userPrompt,
        modelId: selection.modelId,
        cwd: input.cwd,
        tools: profile.tools,
        sandbox: { enabled: true },
        systemPrompt: profile.systemPrompt,
        catalogSnapshotId: selection.catalogSnapshotId,
        ...(selection.modelParams.length === 0 ? {} : { modelParams: selection.modelParams }),
      });
      if (priorAgentId !== undefined && handle.agentId === priorAgentId) {
        throw new ApplicationError(
          "reviewer_session_not_fresh",
          "Reviewer must use a fresh agentId distinct from the prior role session",
        );
      }
      const startedAt = app.now();
      const execution: ExecutionSnapshot = {
        executionId: activeExecutionId,
        opaqueAgentId: handle.agentId,
        roleId: "reviewer",
        modelId: selection.modelId,
        cwd: input.cwd,
        tools: profile.tools,
        systemPrompt: profile.systemPrompt,
        startedAt,
        catalogSnapshotId: selection.catalogSnapshotId,
        modelSelectionRationale: selection.rationale,
        contextReset: true,
        contextResetReason: "reviewer_fresh_session",
        ...(selection.modelParams.length === 0 ? {} : { modelParams: selection.modelParams }),
      };
      app.runs.save({
        ...stored,
        executionLifecycle: "running",
        execution,
        executionId: activeExecutionId,
        agentId: handle.agentId,
        updatedAt: startedAt,
      });
      return handle;
    },
    retry: async (issues) => {
      activeExecutionId = app.createId("exec");
      const handle = await app.runtime.startExecution({
        executionId: activeExecutionId,
        roleId: "reviewer",
        prompt: buildReviewRepairPrompt(stored.taskDescription, issues),
        modelId: selection.modelId,
        cwd: input.cwd,
        tools: profile.tools,
        sandbox: { enabled: true },
        systemPrompt: profile.systemPrompt,
        catalogSnapshotId: selection.catalogSnapshotId,
        ...(selection.modelParams.length === 0 ? {} : { modelParams: selection.modelParams }),
      });
      const startedAt = app.now();
      const execution: ExecutionSnapshot = {
        executionId: activeExecutionId,
        opaqueAgentId: handle.agentId,
        roleId: "reviewer",
        modelId: selection.modelId,
        cwd: input.cwd,
        tools: profile.tools,
        systemPrompt: profile.systemPrompt,
        startedAt,
        catalogSnapshotId: selection.catalogSnapshotId,
        modelSelectionRationale: selection.rationale,
        contextReset: true,
        contextResetReason: "reviewer_fresh_session_retry",
        ...(selection.modelParams.length === 0 ? {} : { modelParams: selection.modelParams }),
      };
      app.runs.save({
        ...stored,
        executionLifecycle: "running",
        execution,
        executionId: activeExecutionId,
        agentId: handle.agentId,
        updatedAt: startedAt,
      });
      return handle;
    },
  });

  const usageObservedAt = app.now();
  const usage = await app.runtime.getUsage(activeExecutionId);
  app.usage.save({
    id: app.createId("usage"),
    executionId: activeExecutionId,
    roleId: "reviewer",
    modelId: selection.modelId,
    catalogSnapshotId: selection.catalogSnapshotId,
    usage,
    source: "cursor_sdk_get_usage",
    observedAt: usageObservedAt,
  });

  if (!parsed.ok) {
    throw new ApplicationError(
      "invalid_review_report",
      `Review report invalid after ${parsed.attempts} attempt(s): ${parsed.lastIssues.join("; ")}`,
    );
  }

  const report = withReviewAssurance(parsed.report, reviewAssurance);
  const openBlocking = blockingFindings(report.findings).length;
  const disposition =
    report.verdict === "approve" && openBlocking === 0 ? "approve" : "request_changes";

  let aggregate = stored.aggregate;
  const status = stored.aggregate.run.status;
  if (status === "reviewing") {
    aggregate = reduceWorkflowAll(aggregate, [
      {
        type: "agent_execution_started",
        at: app.now(),
        roleId: "reviewer",
      },
      {
        type: "agent_execution_completed",
        at: app.now(),
        roleId: "reviewer",
      },
      {
        type: "review_submitted",
        at: app.now(),
        disposition,
        openFindingCount: openBlocking,
      },
    ]);
  }

  const latest = app.runs.get(runId) ?? stored;
  const next: StoredRun = {
    ...latest,
    aggregate,
    executionLifecycle: "settled",
    executionId: parsed.executionId,
    agentId: parsed.agentId,
    lastResultText: parsed.rawText,
    reviewReport: report,
    reviewAssurance,
    reviewModelId: selection.modelId,
    updatedAt: app.now(),
  };
  app.runs.save(next);

  return {
    runId,
    status: aggregate.run.status,
    executionId: parsed.executionId,
    agentId: parsed.agentId,
    modelId: selection.modelId,
    reviewAssurance,
    report,
    openBlockingFindings: openBlocking,
  };
}
