import type { RoleId } from "@aep/domain";
import type { ModelParamSelection } from "@aep/runtime-contracts";

/**
 * User-configured role preferences. Model IDs MUST come from the account catalog —
 * never hardcode vendor model families as universal defaults.
 */
export type RoleModelPreference = {
  readonly roleId: RoleId;
  /** Ordered preference; first catalog-eligible ID wins. Empty → first eligible catalog entry. */
  readonly preferredModelIds: ReadonlyArray<string>;
  /**
   * Optional parameter selections (e.g. optimize_for for an account-enabled auto-smart entry).
   * Values are validated against the chosen catalog entry before use.
   */
  readonly preferredParams?: ReadonlyArray<ModelParamSelection>;
  /**
   * For reviewer: prefer a model different from the implementer selection when possible.
   */
  readonly preferDifferentFromModelId?: string;
};

export type ModelRoutingConfig = {
  readonly roles: ReadonlyArray<RoleModelPreference>;
  /** Optional global allowlist; when set, only these IDs may be chosen. */
  readonly allowlistedModelIds?: ReadonlyArray<string>;
};

export function preferenceForRole(config: ModelRoutingConfig, roleId: RoleId): RoleModelPreference {
  const found = config.roles.find((role) => role.roleId === roleId);
  if (found !== undefined) {
    return found;
  }
  return {
    roleId,
    preferredModelIds: [],
  };
}
