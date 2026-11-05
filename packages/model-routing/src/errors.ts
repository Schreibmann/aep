export type ModelRoutingErrorCode =
  | "catalog_empty"
  | "model_unavailable"
  | "model_not_allowlisted"
  | "extra_spend_not_approved"
  | "optimize_for_unavailable"
  | "no_eligible_model";

export class ModelRoutingError extends Error {
  readonly code: ModelRoutingErrorCode;

  constructor(code: ModelRoutingErrorCode, message: string) {
    super(message);
    this.name = "ModelRoutingError";
    this.code = code;
  }
}
