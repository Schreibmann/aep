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
export {
  aepConfigPath,
  loadAepProjectConfig,
  parseAepProjectConfigYaml,
  tryLoadAepProjectConfig,
} from "./load-config.js";
export type {
  GatePackageManagerId,
  ReactTsViteCapabilities,
  ReactTsViteProfile,
  ResolveReactTsViteProfileInput,
} from "./profiles/react-ts-vite.js";
export {
  REACT_TS_VITE_PROFILE_ID,
  resolveReactTsViteProfile,
} from "./profiles/react-ts-vite.js";
export type { ChecklistItem, SelectChecklistInput } from "./reviewer-checklist.js";
export {
  CHECKLIST_VERSION,
  checklistItemSchema,
  formatChecklistForReviewer,
  REACT_TS_VITE_CHECKLIST,
  selectReviewerChecklist,
} from "./reviewer-checklist.js";
export type {
  DetectedFramework,
  DetectedScript,
  DetectionConfidence,
  DetectionEvidence,
  InstructionFileHit,
  PackageManagerId,
  StackDetectionReport,
} from "./types.js";
