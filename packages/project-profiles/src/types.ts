export type DetectionConfidence = "high" | "medium" | "low";

export type DetectionEvidence = {
  readonly path: string;
  readonly detail: string;
};

export type PackageManagerId = "pnpm" | "npm" | "yarn" | "unknown";

export type DetectedScript = {
  readonly name: string;
  readonly body: string;
  readonly suggestedGate?: "lint" | "typecheck" | "unit" | "build" | "format";
  /** True when mapping is ambiguous — user must confirm before using as a gate. */
  readonly needsConfirmation: boolean;
  readonly confidence: DetectionConfidence;
  readonly evidence: ReadonlyArray<DetectionEvidence>;
};

export type DetectedFramework = {
  readonly id: string;
  readonly confidence: DetectionConfidence;
  readonly evidence: ReadonlyArray<DetectionEvidence>;
};

export type InstructionFileHit = {
  readonly path: string;
  readonly kind: "agents" | "claude" | "cursor_rules" | "readme" | "other";
};

export type StackDetectionReport = {
  readonly rootPath: string;
  readonly packageManager: {
    readonly id: PackageManagerId;
    readonly confidence: DetectionConfidence;
    readonly evidence: ReadonlyArray<DetectionEvidence>;
  };
  readonly packageName?: string;
  readonly nodeEngines?: string;
  readonly frameworks: ReadonlyArray<DetectedFramework>;
  readonly scripts: ReadonlyArray<DetectedScript>;
  readonly instructionFiles: ReadonlyArray<InstructionFileHit>;
  readonly monorepo: {
    readonly detected: boolean;
    readonly confidence: DetectionConfidence;
    readonly evidence: ReadonlyArray<DetectionEvidence>;
  };
  readonly sensitivePathHints: ReadonlyArray<string>;
  readonly generatedPathHints: ReadonlyArray<string>;
  /** Scripts that look gate-related but are ambiguous. */
  readonly ambiguousScripts: ReadonlyArray<DetectedScript>;
};
