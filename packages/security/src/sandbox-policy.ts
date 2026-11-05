import type { AgentSandboxOptions } from "@aep/runtime-contracts";
import { SecurityError } from "./errors.ts";

export type SandboxReadiness = {
  readonly sandboxSupported: boolean;
  readonly detail: string;
};

/**
 * Fail closed: AEP never starts local agents with sandbox disabled.
 */
export function requireEnabledSandbox(
  options: AgentSandboxOptions | { readonly enabled: boolean },
): asserts options is AgentSandboxOptions {
  if (options.enabled !== true) {
    throw new SecurityError(
      "sandbox_disabled",
      "local.sandboxOptions.enabled must be true; AEP fails closed instead of unsandboxed fallback",
    );
  }
}

/**
 * Block unsupported host sandbox rather than retrying unsandboxed.
 */
export function assertSandboxReady(readiness: SandboxReadiness): void {
  if (!readiness.sandboxSupported) {
    throw new SecurityError(
      "sandbox_unsupported",
      `Sandbox not ready on this host: ${readiness.detail}. Use a supported WSL2/Linux host; do not disable sandbox.`,
    );
  }
}

export const REQUIRED_SANDBOX_OPTIONS: AgentSandboxOptions = {
  enabled: true,
};
