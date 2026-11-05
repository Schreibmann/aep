import type { ModelCatalogSnapshot } from "@aep/runtime-contracts";
import { ModelRoutingError } from "./errors.js";

export type CatalogCacheOptions = {
  /** Time-to-live for a cached snapshot. Default 5 minutes. */
  readonly ttlMs?: number;
  readonly now?: () => number;
};

/**
 * In-memory TTL cache for account model catalog snapshots.
 * Callers supply the discover function (Fake or CursorAgentRuntime.discoverModels).
 */
export class ModelCatalogCache {
  private snapshot: ModelCatalogSnapshot | undefined;
  private fetchedAtMs = 0;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: CatalogCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? 5 * 60 * 1000;
    this.now = options.now ?? (() => Date.now());
  }

  getCached(): ModelCatalogSnapshot | undefined {
    if (this.snapshot === undefined) {
      return undefined;
    }
    if (!this.isFresh()) {
      return undefined;
    }
    return this.snapshot;
  }

  isFresh(): boolean {
    if (this.snapshot === undefined) {
      return false;
    }
    return this.now() - this.fetchedAtMs <= this.ttlMs;
  }

  async getOrRefresh(discover: () => Promise<ModelCatalogSnapshot>): Promise<ModelCatalogSnapshot> {
    const cached = this.getCached();
    if (cached !== undefined) {
      return cached;
    }
    return this.refresh(discover);
  }

  async refresh(discover: () => Promise<ModelCatalogSnapshot>): Promise<ModelCatalogSnapshot> {
    const next = await discover();
    if (next.models.length === 0) {
      throw new ModelRoutingError(
        "catalog_empty",
        "Cursor account model catalog is empty; refuse to invent a default model",
      );
    }
    this.snapshot = next;
    this.fetchedAtMs = this.now();
    return next;
  }

  clear(): void {
    this.snapshot = undefined;
    this.fetchedAtMs = 0;
  }
}
