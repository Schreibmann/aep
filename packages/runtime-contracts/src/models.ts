export type RuntimeHealth = {
  readonly ok: boolean;
  readonly runtimeId: "cursor" | "fake";
  readonly detail: string;
  readonly sandboxReady: boolean;
};

export type ModelCatalogEntry = {
  readonly id: string;
  readonly label: string;
  /** Unknown until proven; never invent billing dollars. */
  readonly billingCategory: "included_or_credit" | "extra_spend_possible" | "unknown";
};

export type ModelCatalogSnapshot = {
  readonly capturedAt: string;
  readonly models: ReadonlyArray<ModelCatalogEntry>;
};
