import { DomainError } from "@aep/domain";
import type {
  ModelCatalogEntry,
  ModelCatalogSnapshot,
  ModelParameterDefinition,
  ModelVariantInfo,
} from "@aep/runtime-contracts";
import { desc, eq } from "drizzle-orm";
import type { AepDatabase } from "./open-database.js";
import { modelCatalogSnapshots } from "./schema.js";

export type InsertCatalogSnapshotInput = {
  readonly snapshot: ModelCatalogSnapshot;
  readonly accountFingerprint?: string;
};

function isBillingCategory(value: unknown): value is ModelCatalogEntry["billingCategory"] {
  return value === "included_or_credit" || value === "extra_spend_possible" || value === "unknown";
}

function parseParameters(value: unknown): ReadonlyArray<ModelParameterDefinition> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new DomainError("invalid_catalog_json", "parameters must be an array when present");
  }
  const out: ModelParameterDefinition[] = [];
  for (const item of value) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("id" in item) ||
      typeof item.id !== "string"
    ) {
      throw new DomainError("invalid_catalog_json", "parameter entry missing id");
    }
    if (!("values" in item) || !Array.isArray(item.values)) {
      throw new DomainError("invalid_catalog_json", "parameter entry missing values");
    }
    const values: Array<{ value: string; label?: string }> = [];
    for (const option of item.values) {
      if (
        typeof option !== "object" ||
        option === null ||
        !("value" in option) ||
        typeof option.value !== "string"
      ) {
        throw new DomainError("invalid_catalog_json", "parameter value option invalid");
      }
      values.push({
        value: option.value,
        ...("label" in option && typeof option.label === "string" ? { label: option.label } : {}),
      });
    }
    out.push({
      id: item.id,
      ...("label" in item && typeof item.label === "string" ? { label: item.label } : {}),
      values,
    });
  }
  return out;
}

function parseVariants(value: unknown): ReadonlyArray<ModelVariantInfo> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new DomainError("invalid_catalog_json", "variants must be an array when present");
  }
  const out: ModelVariantInfo[] = [];
  for (const item of value) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("label" in item) ||
      typeof item.label !== "string" ||
      !("params" in item) ||
      !Array.isArray(item.params)
    ) {
      throw new DomainError("invalid_catalog_json", "variant entry invalid");
    }
    const params: Array<{ id: string; value: string }> = [];
    for (const param of item.params) {
      if (
        typeof param !== "object" ||
        param === null ||
        !("id" in param) ||
        typeof param.id !== "string" ||
        !("value" in param) ||
        typeof param.value !== "string"
      ) {
        throw new DomainError("invalid_catalog_json", "variant param invalid");
      }
      params.push({ id: param.id, value: param.value });
    }
    out.push({
      label: item.label,
      params,
      ...("isDefault" in item && typeof item.isDefault === "boolean"
        ? { isDefault: item.isDefault }
        : {}),
      ...("requiresMaxMode" in item && typeof item.requiresMaxMode === "boolean"
        ? { requiresMaxMode: item.requiresMaxMode }
        : {}),
    });
  }
  return out;
}

function parseModels(value: unknown): ReadonlyArray<ModelCatalogEntry> {
  if (!Array.isArray(value)) {
    throw new DomainError("invalid_catalog_json", "models_json must be a JSON array");
  }
  const models: ModelCatalogEntry[] = [];
  for (const item of value) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("id" in item) ||
      typeof item.id !== "string" ||
      !("label" in item) ||
      typeof item.label !== "string" ||
      !("billingCategory" in item) ||
      !isBillingCategory(item.billingCategory)
    ) {
      throw new DomainError("invalid_catalog_json", "catalog model entry invalid");
    }
    const parameters = parseParameters("parameters" in item ? item.parameters : undefined);
    const variants = parseVariants("variants" in item ? item.variants : undefined);
    models.push({
      id: item.id,
      label: item.label,
      billingCategory: item.billingCategory,
      ...(parameters === undefined ? {} : { parameters }),
      ...(variants === undefined ? {} : { variants }),
    });
  }
  return models;
}

function rowToSnapshot(row: {
  readonly id: string;
  readonly capturedAt: string;
  readonly modelsJson: string;
}): ModelCatalogSnapshot {
  const parsed: unknown = JSON.parse(row.modelsJson);
  return {
    snapshotId: row.id,
    capturedAt: row.capturedAt,
    models: parseModels(parsed),
  };
}

/**
 * Store a safe catalog snapshot (ids/labels/params only; no secrets).
 */
export function insertModelCatalogSnapshot(
  database: AepDatabase,
  input: InsertCatalogSnapshotInput,
): void {
  if (input.snapshot.models.length === 0) {
    throw new DomainError("catalog_empty", "Refusing to persist an empty model catalog snapshot");
  }
  database.db
    .insert(modelCatalogSnapshots)
    .values({
      id: input.snapshot.snapshotId,
      capturedAt: input.snapshot.capturedAt,
      modelsJson: JSON.stringify(input.snapshot.models),
      ...(input.accountFingerprint === undefined
        ? {}
        : { accountFingerprint: input.accountFingerprint }),
    })
    .run();
}

export function getLatestModelCatalogSnapshot(
  database: AepDatabase,
): ModelCatalogSnapshot | undefined {
  const rows = database.db
    .select()
    .from(modelCatalogSnapshots)
    .orderBy(desc(modelCatalogSnapshots.capturedAt))
    .limit(1)
    .all();
  const row = rows[0];
  if (row === undefined) {
    return undefined;
  }
  return rowToSnapshot(row);
}

export function getModelCatalogSnapshotById(
  database: AepDatabase,
  snapshotId: string,
): ModelCatalogSnapshot | undefined {
  const rows = database.db
    .select()
    .from(modelCatalogSnapshots)
    .where(eq(modelCatalogSnapshots.id, snapshotId))
    .all();
  const row = rows[0];
  if (row === undefined) {
    return undefined;
  }
  return rowToSnapshot(row);
}
