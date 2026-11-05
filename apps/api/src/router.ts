import type { IncomingMessage } from "node:http";
import {
  type AepApplication,
  ApplicationError,
  decidePlanApproval,
  formatUsageDisplay,
  getAuthStatus,
  getRunStatus,
  listAccountModels,
  requireExplicitApprovalDecision,
} from "@aep/application";
import { LocalApiError } from "./errors.ts";
import {
  listRunSummaries,
  listUsageForRun,
  listWorktreesFromRuns,
  projectRunTimeline,
} from "./read-models.ts";

export type RouteResult = {
  readonly status: number;
  readonly body: unknown;
};

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (raw.length === 0) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new LocalApiError("invalid_json", "Request body must be JSON", 400);
  }
}

function pathParts(url: string): string[] {
  const path = url.split("?")[0] ?? "";
  return path.split("/").filter((part) => part.length > 0);
}

function asDecision(value: unknown): "allow" | "deny" {
  if (value === "allow" || value === "deny" || value === "approve" || value === "reject") {
    return value === "approve" || value === "allow" ? "allow" : "deny";
  }
  throw new LocalApiError("invalid_decision", "decision must be allow|deny", 400);
}

function asJsonRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new LocalApiError("invalid_body", "JSON object required", 400);
  }
  const record: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    record[key] = nested;
  }
  return record;
}

export async function handleApiRequest(
  app: AepApplication,
  req: IncomingMessage,
  url: string,
): Promise<RouteResult> {
  const method = (req.method ?? "GET").toUpperCase();
  const parts = pathParts(url);

  try {
    if (method === "GET" && parts.length === 1 && parts[0] === "health") {
      return { status: 200, body: { ok: true, service: "aep-local-api" } };
    }

    if (method === "GET" && parts.length === 1 && parts[0] === "runs") {
      return { status: 200, body: { runs: listRunSummaries(app) } };
    }

    if (method === "GET" && parts.length === 2 && parts[0] === "runs") {
      const runId = parts[1] ?? "";
      return { status: 200, body: getRunStatus(app, runId) };
    }

    if (method === "GET" && parts.length === 3 && parts[0] === "runs" && parts[2] === "events") {
      const runId = parts[1] ?? "";
      const run = app.runs.get(runId);
      if (run === undefined) {
        throw new ApplicationError("run_not_found", `No run found for id ${runId}`);
      }
      return { status: 200, body: { runId, events: projectRunTimeline(run) } };
    }

    if (method === "GET" && parts.length === 3 && parts[0] === "runs" && parts[2] === "usage") {
      const runId = parts[1] ?? "";
      const run = app.runs.get(runId);
      if (run === undefined) {
        throw new ApplicationError("run_not_found", `No run found for id ${runId}`);
      }
      return { status: 200, body: { runId, usage: listUsageForRun(app, run) } };
    }

    if (method === "GET" && parts.length === 1 && parts[0] === "approvals") {
      const pending = app.runs
        .list()
        .filter((run) => run.pendingApproval !== undefined)
        .map((run) => ({
          runId: run.runId,
          kind: run.pendingApproval?.kind,
          subjectHash: run.pendingApproval?.subjectHash,
          scope: run.pendingApproval?.scope,
          createdAt: run.pendingApproval?.createdAt,
        }));
      return { status: 200, body: { pending } };
    }

    if (method === "POST" && parts.length === 3 && parts[0] === "runs" && parts[2] === "approve") {
      const runId = parts[1] ?? "";
      const record = asJsonRecord(await readJsonBody(req));
      const hasDecision = "decision" in record;
      requireExplicitApprovalDecision(hasDecision);
      const decision = asDecision(record.decision);
      const decidedByRaw = record.decidedBy;
      const decidedBy =
        typeof decidedByRaw === "string" && decidedByRaw.trim().length > 0
          ? decidedByRaw.trim()
          : "dashboard";
      const rationaleRaw = record.rationale;
      const rationale =
        typeof rationaleRaw === "string" && rationaleRaw.trim().length > 0
          ? rationaleRaw.trim()
          : "Approved via local API";
      const result = decidePlanApproval(app, {
        runId,
        decision,
        decidedBy,
        rationale,
      });
      return { status: 200, body: result };
    }

    if (method === "GET" && parts.length === 1 && parts[0] === "models") {
      const report = await listAccountModels(app);
      return { status: 200, body: report };
    }

    if (method === "GET" && parts.length === 1 && parts[0] === "usage") {
      const usage = app.usage.list().map((entry) => ({
        id: entry.id,
        executionId: entry.executionId,
        roleId: entry.roleId,
        modelId: entry.modelId,
        source: entry.source,
        observedAt: entry.observedAt,
        display: formatUsageDisplay(entry.usage),
      }));
      return { status: 200, body: { usage } };
    }

    if (method === "GET" && parts.length === 1 && parts[0] === "worktrees") {
      return { status: 200, body: { worktrees: listWorktreesFromRuns(app) } };
    }

    if (method === "GET" && parts.length === 1 && parts[0] === "auth") {
      const auth = await getAuthStatus(app);
      return {
        status: 200,
        body: {
          ok: auth.ok,
          runtimeId: auth.runtimeId,
          credentialConfigured: auth.credentialConfigured,
          sandboxReady: auth.sandboxReady,
          billingOwner: auth.billingOwner,
        },
      };
    }

    throw new LocalApiError("not_found", `No route for ${method} ${url}`, 404);
  } catch (error) {
    if (error instanceof ApplicationError) {
      const status = error.code === "run_not_found" ? 404 : 400;
      throw new LocalApiError(error.code, error.message, status);
    }
    throw error;
  }
}
