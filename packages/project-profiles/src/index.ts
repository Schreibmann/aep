export type { BuildConfigInput } from "./build-config.js";
export {
  buildProjectConfigFromDetection,
  renderProjectConfigYaml,
} from "./build-config.js";
export type { AepProjectConfig } from "./config-schema.js";
export {
  AEP_CONFIG_VERSION,
  aepProjectConfigSchema,
  parseAepProjectConfig,
} from "./config-schema.js";
export { detectStack, packageManagerIdOrUnknown } from "./detect-stack.js";
export { ProjectProfilesError } from "./errors.js";
export type {
  DetectedFramework,
  DetectedScript,
  DetectionConfidence,
  DetectionEvidence,
  InstructionFileHit,
  PackageManagerId,
  StackDetectionReport,
} from "./types.js";
