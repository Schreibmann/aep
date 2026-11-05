import { listOptimizeForValues, ModelCatalogCache } from "@aep/model-routing";
import type { AepApplication } from "./create-app.js";
import { ApplicationError } from "./errors.js";

export type ListedModel = {
  readonly id: string;
  readonly label: string;
  readonly billingCategory: "included_or_credit" | "extra_spend_possible" | "unknown";
  readonly optimizeForValues: ReadonlyArray<string>;
};

export type ModelsReport = {
  readonly snapshotId: string;
  readonly capturedAt: string;
  readonly models: ReadonlyArray<ListedModel>;
};

/**
 * Refresh (or reuse TTL cache) of account model catalog for CLI `aep models`.
 */
export async function listAccountModels(
  app: AepApplication,
  cache = new ModelCatalogCache(),
): Promise<ModelsReport> {
  try {
    const catalog = await cache.getOrRefresh(() => app.runtime.discoverModels());
    return {
      snapshotId: catalog.snapshotId,
      capturedAt: catalog.capturedAt,
      models: catalog.models.map((model) => ({
        id: model.id,
        label: model.label,
        billingCategory: model.billingCategory,
        optimizeForValues: listOptimizeForValues(model),
      })),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ApplicationError("model_catalog_unavailable", message);
  }
}
