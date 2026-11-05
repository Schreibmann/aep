import type { AepApplication } from "./create-app.js";

export type BillingOwnerHint = "unknown" | "user_plan" | "team_service_account";

export type AuthStatusReport = {
  readonly runtimeId: "cursor" | "fake";
  readonly ok: boolean;
  readonly credentialConfigured: boolean;
  readonly sandboxReady: boolean;
  readonly billingOwner: BillingOwnerHint;
  readonly detail: string;
};

/**
 * Safe auth/diagnostics summary. Never returns secret values.
 */
export async function getAuthStatus(app: AepApplication): Promise<AuthStatusReport> {
  const health = await app.runtime.checkAvailability();
  if (health.runtimeId === "fake") {
    return {
      runtimeId: "fake",
      ok: health.ok,
      credentialConfigured: true,
      sandboxReady: health.sandboxReady,
      billingOwner: "unknown",
      detail:
        "FakeAgentRuntime active; Cursor API key not required. Live billing owner unknown until Cursor runtime is wired.",
    };
  }

  return {
    runtimeId: "cursor",
    ok: health.ok,
    credentialConfigured: health.ok,
    sandboxReady: health.sandboxReady,
    billingOwner: "unknown",
    detail: health.ok
      ? "Cursor runtime credentials accepted by probe; whether usage bills to a user plan or team service account is unknown without provider settlement metadata."
      : health.detail,
  };
}
