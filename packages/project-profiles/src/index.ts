export type { BuildConfigInput } from "./build-config.ts";
export {
  buildProjectConfigFromDetection,
  renderProjectConfigYaml,
} from "./build-config.ts";
export type { AepProjectConfig } from "./config-schema.ts";
export {
  AEP_CONFIG_VERSION,
  aepProjectConfigSchema,
  parseAepProjectConfig,
} from "./config-schema.ts";
export { detectStack, packageManagerIdOrUnknown } from "./detect-stack.ts";
export { ProjectProfilesError } from "./errors.ts";
export type {
  AssembledKnowledgeChunk,
  AssembledKnowledgeContext,
  AssembleKnowledgeContextInput,
} from "./knowledge/assemble-context.ts";
export {
  assembleKnowledgeContext,
  estimateTokens,
} from "./knowledge/assemble-context.ts";
export type {
  BuildKnowledgePacksInput,
  BuildKnowledgePacksResult,
  UpdateKnowledgePackInput,
} from "./knowledge/build-packs.ts";
export {
  buildKnowledgePacks,
  listKnowledgePacks,
  updateKnowledgePack,
} from "./knowledge/build-packs.ts";
export {
  isExcludedKnowledgePath,
  KNOWLEDGE_SOURCE_CANDIDATES,
  knowledgePackPath,
  knowledgePacksDir,
} from "./knowledge/paths.ts";
export type { KnowledgePack, KnowledgePackCategory } from "./knowledge/schema.ts";
export {
  KNOWLEDGE_PACK_SCHEMA_VERSION,
  knowledgePackCategorySchema,
  knowledgePackSchema,
  parseKnowledgePack,
} from "./knowledge/schema.ts";
export {
  aepConfigPath,
  loadAepProjectConfig,
  parseAepProjectConfigYaml,
  tryLoadAepProjectConfig,
} from "./load-config.ts";
export type {
  GatePackageManagerId,
  ReactTsViteCapabilities,
  ReactTsViteProfile,
  ResolveReactTsViteProfileInput,
} from "./profiles/react-ts-vite.ts";
export {
  REACT_TS_VITE_PROFILE_ID,
  resolveReactTsViteProfile,
} from "./profiles/react-ts-vite.ts";
export type { ChecklistItem, SelectChecklistInput } from "./reviewer-checklist.ts";
export {
  CHECKLIST_VERSION,
  checklistItemSchema,
  formatChecklistForReviewer,
  REACT_TS_VITE_CHECKLIST,
  selectReviewerChecklist,
} from "./reviewer-checklist.ts";
export type {
  DetectedFramework,
  DetectedScript,
  DetectionConfidence,
  DetectionEvidence,
  InstructionFileHit,
  PackageManagerId,
  StackDetectionReport,
} from "./types.ts";
