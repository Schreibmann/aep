export type RuntimeHealth = {
  readonly ok: boolean;
  readonly runtimeId: "cursor" | "fake";
  readonly detail: string;
  readonly sandboxReady: boolean;
};

export type ModelParameterValueOption = {
  readonly value: string;
  readonly label?: string;
};

export type ModelParameterDefinition = {
  readonly id: string;
  readonly label?: string;
  readonly values: ReadonlyArray<ModelParameterValueOption>;
};

export type ModelVariantInfo = {
  readonly label: string;
  readonly params: ReadonlyArray<{ readonly id: string; readonly value: string }>;
  readonly isDefault?: boolean;
  readonly requiresMaxMode?: boolean;
};

export type ModelCatalogEntry = {
  readonly id: string;
  readonly label: string;
  /** Unknown until proven; never invent billing dollars. */
  readonly billingCategory: "included_or_credit" | "extra_spend_possible" | "unknown";
  readonly parameters?: ReadonlyArray<ModelParameterDefinition>;
  readonly variants?: ReadonlyArray<ModelVariantInfo>;
};

export type ModelCatalogSnapshot = {
  /** Stable id for this capture; recorded on each role execution. */
  readonly snapshotId: string;
  readonly capturedAt: string;
  readonly models: ReadonlyArray<ModelCatalogEntry>;
};

export type ModelParamSelection = {
  readonly id: string;
  readonly value: string;
};
