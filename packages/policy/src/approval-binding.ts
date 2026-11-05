import { createHash } from "node:crypto";

export type ApprovalSubjectKind =
  | "plan"
  | "out_of_scope_files"
  | "network"
  | "extra_model_charge"
  | "budget_continuation";

export const APPROVAL_SUBJECT_KINDS: ReadonlyArray<ApprovalSubjectKind> = [
  "plan",
  "out_of_scope_files",
  "network",
  "extra_model_charge",
  "budget_continuation",
];

export type ApprovalDecision = "allow" | "deny";

/**
 * Stable SHA-256 (16 hex chars) over canonical JSON so approvals bind to a specific subject.
 */
export function hashApprovalSubject(value: unknown): string {
  const canonical = canonicalize(value);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sortValue(item));
  }
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  const sorted: Record<string, unknown> = {};
  for (const [key, nested] of entries) {
    sorted[key] = sortValue(nested);
  }
  return sorted;
}

export type PendingApproval = {
  readonly kind: ApprovalSubjectKind;
  readonly subjectHash: string;
  readonly scope: string;
  readonly createdAt: string;
};

export type RecordedApproval = {
  readonly id: string;
  readonly runId: string;
  readonly kind: ApprovalSubjectKind;
  readonly subjectHash: string;
  readonly decision: ApprovalDecision;
  readonly decidedBy: string;
  readonly rationale: string;
  readonly scope: string;
  readonly createdAt: string;
};

export type SubjectHashCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: "approval_subject_mismatch"; readonly message: string };

/**
 * Fail closed when the bound subject changed after the pending approval was issued.
 */
export function checkSubjectHashUnchanged(
  pendingHash: string,
  currentHash: string,
): SubjectHashCheck {
  if (pendingHash === currentHash) {
    return { ok: true };
  }
  return {
    ok: false,
    code: "approval_subject_mismatch",
    message: `Approval subject changed (pending=${pendingHash}, current=${currentHash})`,
  };
}
