export type ApiClientOptions = {
  readonly baseUrl: string;
  readonly token: string;
  readonly fetchImpl?: typeof fetch;
};

export class DashboardApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "DashboardApiError";
    this.status = status;
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export function createApiClient(options: ApiClientOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetchImpl(`${options.baseUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${options.token}`,
        ...(init?.headers ?? {}),
      },
    });
    const body = await parseJson(response);
    if (!response.ok) {
      const error = isRecord(body) && isRecord(body.error) ? body.error : undefined;
      const code =
        error !== undefined && typeof error.code === "string" ? error.code : "http_error";
      const message =
        error !== undefined && typeof error.message === "string"
          ? error.message
          : `HTTP ${response.status}`;
      throw new DashboardApiError(response.status, code, message);
    }
    return body;
  }

  return {
    listRuns: () => request("/runs"),
    getRun: (runId: string) => request(`/runs/${encodeURIComponent(runId)}`),
    getEvents: (runId: string) => request(`/runs/${encodeURIComponent(runId)}/events`),
    getRunUsage: (runId: string) => request(`/runs/${encodeURIComponent(runId)}/usage`),
    listApprovals: () => request("/approvals"),
    listModels: () => request("/models"),
    listUsage: () => request("/usage"),
    listWorktrees: () => request("/worktrees"),
    getAuth: () => request("/auth"),
    approve: (runId: string, decision: "allow" | "deny") =>
      request(`/runs/${encodeURIComponent(runId)}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision,
          decidedBy: "dashboard",
          rationale: `Dashboard ${decision}`,
        }),
      }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

export type RunSummary = {
  readonly runId: string;
  readonly taskDescription: string;
  readonly status: string;
  readonly fixCycleCount: number;
  readonly executionLifecycle: string;
  readonly recoveryClassification: string;
  readonly pendingApprovalKind?: string;
  readonly risk?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type TimelineEvent = {
  readonly id: string;
  readonly at: string;
  readonly kind: string;
  readonly text: string;
};

export type UsageDisplay = {
  readonly status: string;
  readonly costStatus: string;
  readonly tokens: {
    readonly inputTokens?: number;
    readonly outputTokens?: number;
    readonly cacheReadTokens?: number;
    readonly cacheWriteTokens?: number;
  };
  readonly costLabel: string;
  readonly billedUsd?: number;
  readonly note: string;
};

export type UsageEntry = {
  readonly id: string;
  readonly executionId: string;
  readonly roleId: string;
  readonly modelId?: string;
  readonly source: string;
  readonly observedAt: string;
  readonly display: UsageDisplay;
};

export type PendingApprovalView = {
  readonly runId: string;
  readonly kind?: string;
  readonly subjectHash?: string;
  readonly scope?: string;
  readonly createdAt?: string;
};

export type ModelRow = {
  readonly id: string;
  readonly label: string;
  readonly billingCategory: string;
  readonly optimizeForValues: ReadonlyArray<string>;
};

export type ModelsReport = {
  readonly snapshotId: string;
  readonly capturedAt: string;
  readonly models: ReadonlyArray<ModelRow>;
};

export type WorktreeView = {
  readonly runId: string;
  readonly path?: string;
  readonly branch?: string;
  readonly status: string;
};

export type AuthView = {
  readonly ok: boolean;
  readonly runtimeId: string;
  readonly credentialConfigured: boolean;
  readonly sandboxReady: boolean;
  readonly billingOwner: string;
};

export function parseRuns(body: unknown): ReadonlyArray<RunSummary> {
  if (!isRecord(body) || !Array.isArray(body.runs)) {
    return [];
  }
  const out: RunSummary[] = [];
  for (const item of body.runs) {
    const parsed = parseRunSummary(item);
    if (parsed !== undefined) {
      out.push(parsed);
    }
  }
  return out;
}

export function parseRunSummary(value: unknown): RunSummary | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (typeof value.runId !== "string" || typeof value.taskDescription !== "string") {
    return undefined;
  }
  if (typeof value.status !== "string") {
    return undefined;
  }
  return {
    runId: value.runId,
    taskDescription: value.taskDescription,
    status: value.status,
    fixCycleCount: typeof value.fixCycleCount === "number" ? value.fixCycleCount : 0,
    executionLifecycle:
      typeof value.executionLifecycle === "string" ? value.executionLifecycle : "unknown",
    recoveryClassification:
      typeof value.recoveryClassification === "string" ? value.recoveryClassification : "unknown",
    ...(typeof value.pendingApprovalKind === "string"
      ? { pendingApprovalKind: value.pendingApprovalKind }
      : {}),
    ...(typeof value.risk === "string" ? { risk: value.risk } : {}),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
  };
}

export function parseTimelineEvents(body: unknown): ReadonlyArray<TimelineEvent> {
  if (!isRecord(body) || !Array.isArray(body.events)) {
    return [];
  }
  const out: TimelineEvent[] = [];
  for (const item of body.events) {
    if (!isRecord(item)) {
      continue;
    }
    if (
      typeof item.id !== "string" ||
      typeof item.at !== "string" ||
      typeof item.kind !== "string" ||
      typeof item.text !== "string"
    ) {
      continue;
    }
    out.push({ id: item.id, at: item.at, kind: item.kind, text: item.text });
  }
  return out;
}

export function parseUsageEntries(body: unknown): ReadonlyArray<UsageEntry> {
  if (!isRecord(body) || !Array.isArray(body.usage)) {
    return [];
  }
  const out: UsageEntry[] = [];
  for (const item of body.usage) {
    if (!isRecord(item) || !isRecord(item.display) || !isRecord(item.display.tokens)) {
      continue;
    }
    if (typeof item.id !== "string" || typeof item.executionId !== "string") {
      continue;
    }
    const tokens = item.display.tokens;
    const display: UsageDisplay = {
      status: typeof item.display.status === "string" ? item.display.status : "unknown",
      costStatus: typeof item.display.costStatus === "string" ? item.display.costStatus : "unknown",
      tokens: {
        ...(typeof tokens.inputTokens === "number" ? { inputTokens: tokens.inputTokens } : {}),
        ...(typeof tokens.outputTokens === "number" ? { outputTokens: tokens.outputTokens } : {}),
        ...(typeof tokens.cacheReadTokens === "number"
          ? { cacheReadTokens: tokens.cacheReadTokens }
          : {}),
        ...(typeof tokens.cacheWriteTokens === "number"
          ? { cacheWriteTokens: tokens.cacheWriteTokens }
          : {}),
      },
      costLabel: typeof item.display.costLabel === "string" ? item.display.costLabel : "unknown",
      ...(typeof item.display.billedUsd === "number" ? { billedUsd: item.display.billedUsd } : {}),
      note: typeof item.display.note === "string" ? item.display.note : "",
    };
    out.push({
      id: item.id,
      executionId: item.executionId,
      roleId: typeof item.roleId === "string" ? item.roleId : "unknown",
      ...(typeof item.modelId === "string" ? { modelId: item.modelId } : {}),
      source: typeof item.source === "string" ? item.source : "unknown",
      observedAt: typeof item.observedAt === "string" ? item.observedAt : "",
      display,
    });
  }
  return out;
}

export function parseApprovals(body: unknown): ReadonlyArray<PendingApprovalView> {
  if (!isRecord(body) || !Array.isArray(body.pending)) {
    return [];
  }
  const out: PendingApprovalView[] = [];
  for (const item of body.pending) {
    if (!isRecord(item) || typeof item.runId !== "string") {
      continue;
    }
    out.push({
      runId: item.runId,
      ...(typeof item.kind === "string" ? { kind: item.kind } : {}),
      ...(typeof item.subjectHash === "string" ? { subjectHash: item.subjectHash } : {}),
      ...(typeof item.scope === "string" ? { scope: item.scope } : {}),
      ...(typeof item.createdAt === "string" ? { createdAt: item.createdAt } : {}),
    });
  }
  return out;
}

export function parseModels(body: unknown): ModelsReport | undefined {
  if (!isRecord(body) || !Array.isArray(body.models)) {
    return undefined;
  }
  const models: ModelRow[] = [];
  for (const item of body.models) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.label !== "string") {
      continue;
    }
    models.push({
      id: item.id,
      label: item.label,
      billingCategory: typeof item.billingCategory === "string" ? item.billingCategory : "unknown",
      optimizeForValues: Array.isArray(item.optimizeForValues)
        ? item.optimizeForValues.filter((v): v is string => typeof v === "string")
        : [],
    });
  }
  return {
    snapshotId: typeof body.snapshotId === "string" ? body.snapshotId : "",
    capturedAt: typeof body.capturedAt === "string" ? body.capturedAt : "",
    models,
  };
}

export function parseWorktrees(body: unknown): ReadonlyArray<WorktreeView> {
  if (!isRecord(body) || !Array.isArray(body.worktrees)) {
    return [];
  }
  const out: WorktreeView[] = [];
  for (const item of body.worktrees) {
    if (!isRecord(item) || typeof item.runId !== "string" || typeof item.status !== "string") {
      continue;
    }
    out.push({
      runId: item.runId,
      status: item.status,
      ...(typeof item.path === "string" ? { path: item.path } : {}),
      ...(typeof item.branch === "string" ? { branch: item.branch } : {}),
    });
  }
  return out;
}

export function parseAuth(body: unknown): AuthView | undefined {
  if (!isRecord(body)) {
    return undefined;
  }
  if (typeof body.ok !== "boolean" || typeof body.runtimeId !== "string") {
    return undefined;
  }
  return {
    ok: body.ok,
    runtimeId: body.runtimeId,
    credentialConfigured: body.credentialConfigured === true,
    sandboxReady: body.sandboxReady === true,
    billingOwner: typeof body.billingOwner === "string" ? body.billingOwner : "unknown",
  };
}
