import { join } from "node:path";

const SENSITIVE_BASENAME = /^(?:\.env(?:\..+)?|.*(?:secret|credential|password|token).*)$/i;
const GENERATED_SEGMENTS = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  "out",
  ".git",
  ".turbo",
  ".cache",
]);

export function knowledgePacksDir(projectRoot: string): string {
  return join(projectRoot, ".aep", "knowledge");
}

export function knowledgePackPath(projectRoot: string, packId: string): string {
  return join(knowledgePacksDir(projectRoot), `${packId}.json`);
}

export function isExcludedKnowledgePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  const segments = normalized.split("/").filter((part) => part.length > 0);
  if (segments.some((segment) => GENERATED_SEGMENTS.has(segment))) {
    return true;
  }
  const base = segments[segments.length - 1] ?? "";
  if (SENSITIVE_BASENAME.test(base)) {
    return true;
  }
  if (normalized.includes("secrets/")) {
    return true;
  }
  return false;
}

/** Candidate sources — only real project docs, never speculative generation. */
export const KNOWLEDGE_SOURCE_CANDIDATES: ReadonlyArray<{
  readonly relativePath: string;
  readonly category: "conventions" | "architecture" | "api_patterns" | "examples" | "other";
  readonly title: string;
}> = [
  { relativePath: "AGENTS.md", category: "conventions", title: "Agent conventions" },
  { relativePath: "CLAUDE.md", category: "conventions", title: "Claude project notes" },
  { relativePath: "README.md", category: "other", title: "Project README" },
  {
    relativePath: "docs/architecture.md",
    category: "architecture",
    title: "Architecture documentation",
  },
  {
    relativePath: "AEP-Architecture.md",
    category: "architecture",
    title: "AEP architecture",
  },
  {
    relativePath: "docs/api.md",
    category: "api_patterns",
    title: "API patterns",
  },
  {
    relativePath: "docs/examples.md",
    category: "examples",
    title: "Examples",
  },
];
