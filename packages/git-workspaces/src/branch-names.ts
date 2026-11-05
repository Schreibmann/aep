import { GitWorkspacesError } from "./errors.ts";

const SEGMENT = /^[a-zA-Z0-9._-]+$/;

function sanitizeSegment(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new GitWorkspacesError("invalid_branch_segment", `${label} must be non-empty`);
  }
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    throw new GitWorkspacesError(
      "invalid_branch_segment",
      `${label} must not contain path separators`,
    );
  }
  if (!SEGMENT.test(trimmed)) {
    throw new GitWorkspacesError(
      "invalid_branch_segment",
      `${label} may only contain letters, digits, '.', '_' and '-'`,
    );
  }
  return trimmed;
}

/**
 * AEP branch naming scheme: `aep/<task-id>/<run-id>`.
 */
export function buildAepBranchName(taskId: string, runId: string): string {
  return `aep/${sanitizeSegment(taskId, "taskId")}/${sanitizeSegment(runId, "runId")}`;
}

export function buildWorktreeDirectoryName(taskId: string, runId: string): string {
  return `${sanitizeSegment(taskId, "taskId")}__${sanitizeSegment(runId, "runId")}`;
}
