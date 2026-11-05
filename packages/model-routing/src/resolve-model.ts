import type { RoleId } from "@aep/domain";
import type {
  ModelCatalogEntry,
  ModelCatalogSnapshot,
  ModelParamSelection,
} from "@aep/runtime-contracts";
import { type CostPolicy, DEFAULT_COST_POLICY, isModelCostAllowed } from "./cost-policy.ts";
import { ModelRoutingError } from "./errors.ts";
import {
  type ModelRoutingConfig,
  preferenceForRole,
  type RoleModelPreference,
} from "./role-policy.ts";

export type ModelSelectionResult = {
  readonly modelId: string;
  readonly modelParams: ReadonlyArray<ModelParamSelection>;
  readonly catalogSnapshotId: string;
  readonly billingCategory: ModelCatalogEntry["billingCategory"];
  readonly rationale: string;
  readonly assuranceNote?: string;
};

export type ResolveModelInput = {
  readonly roleId: RoleId;
  readonly catalog: ModelCatalogSnapshot;
  readonly config: ModelRoutingConfig;
  readonly costPolicy?: CostPolicy;
  /** Explicit requested model; must exist in catalog (no silent substitution). */
  readonly requestedModelId?: string;
};

const OPTIMIZE_FOR_PARAM = "optimize_for";

function findEntry(catalog: ModelCatalogSnapshot, modelId: string): ModelCatalogEntry | undefined {
  return catalog.models.find((model) => model.id === modelId);
}

function filterEligible(
  catalog: ModelCatalogSnapshot,
  config: ModelRoutingConfig,
  costPolicy: CostPolicy,
): ModelCatalogEntry[] {
  const allow = config.allowlistedModelIds;
  const out: ModelCatalogEntry[] = [];
  for (const entry of catalog.models) {
    if (allow !== undefined && !allow.includes(entry.id)) {
      continue;
    }
    if (!isModelCostAllowed(entry, costPolicy)) {
      continue;
    }
    out.push(entry);
  }
  return out;
}

function validateParams(
  entry: ModelCatalogEntry,
  params: ReadonlyArray<ModelParamSelection> | undefined,
): ReadonlyArray<ModelParamSelection> {
  if (params === undefined || params.length === 0) {
    return [];
  }
  const definitions = entry.parameters ?? [];
  const validated: ModelParamSelection[] = [];
  for (const param of params) {
    const definition = definitions.find((item) => item.id === param.id);
    if (definition === undefined) {
      throw new ModelRoutingError(
        "optimize_for_unavailable",
        `Model "${entry.id}" does not expose parameter "${param.id}" in the account catalog`,
      );
    }
    const allowed = definition.values.some((value) => value.value === param.value);
    if (!allowed) {
      throw new ModelRoutingError(
        "optimize_for_unavailable",
        `Model "${entry.id}" parameter "${param.id}" value "${param.value}" is not enabled for this account`,
      );
    }
    validated.push({ id: param.id, value: param.value });
  }
  return validated;
}

function pickPreferred(
  eligible: ReadonlyArray<ModelCatalogEntry>,
  preference: RoleModelPreference,
): { entry: ModelCatalogEntry; rationale: string; assuranceNote?: string } | undefined {
  for (const preferredId of preference.preferredModelIds) {
    const hit = eligible.find((entry) => entry.id === preferredId);
    if (hit !== undefined) {
      return {
        entry: hit,
        rationale: `role_preference:${preference.roleId}:${preferredId}`,
      };
    }
  }

  const avoid = preference.preferDifferentFromModelId;
  if (avoid !== undefined) {
    const different = eligible.find((entry) => entry.id !== avoid);
    if (different !== undefined) {
      return {
        entry: different,
        rationale: `reviewer_different_model:${different.id}`,
      };
    }
    const same = eligible.find((entry) => entry.id === avoid);
    if (same !== undefined) {
      return {
        entry: same,
        rationale: `reviewer_same_model_fresh_session:${same.id}`,
        assuranceNote: "same_model_fresh_session",
      };
    }
  }

  const first = eligible[0];
  if (first === undefined) {
    return undefined;
  }
  return {
    entry: first,
    rationale: `catalog_first_eligible:${first.id}`,
  };
}

/**
 * Resolve a concrete model for a role from the current account catalog.
 * Missing / unapproved models fail closed — never silent substitution.
 */
export function resolveModelForRole(input: ResolveModelInput): ModelSelectionResult {
  const costPolicy = input.costPolicy ?? DEFAULT_COST_POLICY;
  if (input.catalog.models.length === 0) {
    throw new ModelRoutingError("catalog_empty", "Model catalog snapshot has no models");
  }

  const preference = preferenceForRole(input.config, input.roleId);
  const eligible = filterEligible(input.catalog, input.config, costPolicy);

  if (input.requestedModelId !== undefined) {
    const requested = findEntry(input.catalog, input.requestedModelId);
    if (requested === undefined) {
      throw new ModelRoutingError(
        "model_unavailable",
        `Requested model "${input.requestedModelId}" is not in catalog snapshot ${input.catalog.snapshotId}`,
      );
    }
    if (
      input.config.allowlistedModelIds !== undefined &&
      !input.config.allowlistedModelIds.includes(requested.id)
    ) {
      throw new ModelRoutingError(
        "model_not_allowlisted",
        `Requested model "${requested.id}" is not in the user allowlist`,
      );
    }
    if (!isModelCostAllowed(requested, costPolicy)) {
      throw new ModelRoutingError(
        "extra_spend_not_approved",
        `Requested model "${requested.id}" may incur extra spend and is not approved`,
      );
    }
    const modelParams = validateParams(requested, preference.preferredParams);
    return {
      modelId: requested.id,
      modelParams,
      catalogSnapshotId: input.catalog.snapshotId,
      billingCategory: requested.billingCategory,
      rationale: `explicit_request:${requested.id}`,
    };
  }

  const picked = pickPreferred(eligible, preference);
  if (picked === undefined) {
    throw new ModelRoutingError(
      "no_eligible_model",
      `No eligible model remains for role "${input.roleId}" after catalog, allowlist, and cost policy filters`,
    );
  }

  const modelParams = validateParams(picked.entry, preference.preferredParams);
  return {
    modelId: picked.entry.id,
    modelParams,
    catalogSnapshotId: input.catalog.snapshotId,
    billingCategory: picked.entry.billingCategory,
    rationale: picked.rationale,
    ...(picked.assuranceNote === undefined ? {} : { assuranceNote: picked.assuranceNote }),
  };
}

/**
 * Helper: if an auto-smart-like catalog entry exposes optimize_for, list enabled values.
 * Does not treat any id as a universal default — only reports what the catalog exposes.
 */
export function listOptimizeForValues(entry: ModelCatalogEntry): ReadonlyArray<string> {
  const parameter = (entry.parameters ?? []).find((item) => item.id === OPTIMIZE_FOR_PARAM);
  if (parameter === undefined) {
    return [];
  }
  return parameter.values.map((value) => value.value);
}
