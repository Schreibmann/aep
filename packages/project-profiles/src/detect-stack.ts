import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ProjectProfilesError } from "./errors.ts";
import type {
  DetectedFramework,
  DetectedScript,
  DetectionConfidence,
  DetectionEvidence,
  InstructionFileHit,
  PackageManagerId,
  StackDetectionReport,
} from "./types.ts";

const SENSITIVE_HINTS = [
  ".env",
  ".env.*",
  "**/*secret*",
  "**/*credential*",
  "**/secrets/**",
] as const;

const GENERATED_HINTS = [
  "node_modules/**",
  "dist/**",
  "build/**",
  "coverage/**",
  ".next/**",
  "out/**",
] as const;

type PackageJson = {
  readonly name?: string;
  readonly engines?: { readonly node?: string };
  readonly scripts?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly workspaces?: unknown;
};

function evidence(path: string, detail: string): DetectionEvidence {
  return { path, detail };
}

function readJsonObject(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

function asPackageJson(value: unknown): PackageJson | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return value;
}

function detectPackageManager(root: string): StackDetectionReport["packageManager"] {
  const hits: DetectionEvidence[] = [];
  if (existsSync(join(root, "pnpm-lock.yaml"))) {
    hits.push(evidence("pnpm-lock.yaml", "lockfile present"));
    return { id: "pnpm", confidence: "high", evidence: hits };
  }
  if (existsSync(join(root, "yarn.lock"))) {
    hits.push(evidence("yarn.lock", "lockfile present"));
    return { id: "yarn", confidence: "high", evidence: hits };
  }
  if (existsSync(join(root, "package-lock.json"))) {
    hits.push(evidence("package-lock.json", "lockfile present"));
    return { id: "npm", confidence: "high", evidence: hits };
  }
  if (existsSync(join(root, "package.json"))) {
    hits.push(evidence("package.json", "no lockfile; package manager unknown"));
    return { id: "unknown", confidence: "low", evidence: hits };
  }
  return {
    id: "unknown",
    confidence: "low",
    evidence: [evidence("(root)", "no package.json")],
  };
}

function suggestGate(name: string, body: string): DetectedScript["suggestedGate"] | undefined {
  const n = name.toLowerCase();
  const b = body.toLowerCase();
  if (n === "lint" || n === "eslint") {
    return "lint";
  }
  if (n === "typecheck" || n === "type-check" || n === "tsc") {
    return "typecheck";
  }
  if (n === "test" || n === "test:unit" || n === "unit") {
    return "unit";
  }
  if (n === "build") {
    return "build";
  }
  if (n === "format" || n === "fmt") {
    return "format";
  }
  // Ambiguous / composite names — suggest a gate but require confirmation.
  if (n.includes("lint") || b.includes("eslint") || b.includes("biome check")) {
    return "lint";
  }
  if (n.includes("type") && (n.includes("check") || b.includes("tsc"))) {
    return "typecheck";
  }
  if (n.includes("test") || b.includes("vitest") || b.includes("jest")) {
    return "unit";
  }
  if (n.includes("build") || b.includes("vite build")) {
    return "build";
  }
  if (
    n.includes("check") ||
    n.includes("verify") ||
    n.includes("ci") ||
    n.endsWith(":all") ||
    n.includes("all")
  ) {
    if (
      b.includes("lint") ||
      b.includes("test") ||
      b.includes("typecheck") ||
      b.includes("build")
    ) {
      return "lint";
    }
  }
  return undefined;
}

const EXACT_GATE_SCRIPTS = new Set([
  "lint",
  "typecheck",
  "type-check",
  "test",
  "test:unit",
  "unit",
  "build",
  "format",
  "fmt",
]);

function scriptConfidence(
  name: string,
  suggested: DetectedScript["suggestedGate"],
): {
  confidence: DetectionConfidence;
  needsConfirmation: boolean;
} {
  if (suggested !== undefined && EXACT_GATE_SCRIPTS.has(name)) {
    return { confidence: "high", needsConfirmation: false };
  }
  if (suggested !== undefined) {
    return { confidence: "medium", needsConfirmation: true };
  }
  return { confidence: "low", needsConfirmation: false };
}

function detectScripts(pkg: PackageJson, packagePath: string): ReadonlyArray<DetectedScript> {
  const scripts = pkg.scripts ?? {};
  const out: DetectedScript[] = [];
  for (const [name, body] of Object.entries(scripts)) {
    if (typeof body !== "string") {
      continue;
    }
    const suggestedGate = suggestGate(name, body);
    const { confidence, needsConfirmation } = scriptConfidence(name, suggestedGate);
    out.push({
      name,
      body,
      ...(suggestedGate === undefined ? {} : { suggestedGate }),
      needsConfirmation,
      confidence,
      evidence: [evidence(packagePath, `scripts.${name}`)],
    });
  }
  return out;
}

function detectFrameworks(pkg: PackageJson, packagePath: string): ReadonlyArray<DetectedFramework> {
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const frameworks: DetectedFramework[] = [];
  const add = (id: string, dep: string, confidence: DetectionConfidence) => {
    if (deps[dep] !== undefined) {
      frameworks.push({
        id,
        confidence,
        evidence: [evidence(packagePath, `dependency ${dep}@${deps[dep]}`)],
      });
    }
  };
  add("react", "react", "high");
  add("vite", "vite", "high");
  add("typescript", "typescript", "high");
  add("next", "next", "high");
  add("vue", "vue", "high");
  add("svelte", "svelte", "high");
  add("vitest", "vitest", "high");
  add("jest", "jest", "high");
  add("eslint", "eslint", "medium");
  add("biome", "@biomejs/biome", "high");
  return frameworks;
}

function detectInstructionFiles(root: string): ReadonlyArray<InstructionFileHit> {
  const hits: InstructionFileHit[] = [];
  const candidates: ReadonlyArray<{ path: string; kind: InstructionFileHit["kind"] }> = [
    { path: "AGENTS.md", kind: "agents" },
    { path: "CLAUDE.md", kind: "claude" },
    { path: "README.md", kind: "readme" },
    { path: ".cursor/rules", kind: "cursor_rules" },
  ];
  for (const item of candidates) {
    const absolute = join(root, item.path);
    if (existsSync(absolute)) {
      hits.push({ path: item.path, kind: item.kind });
    }
  }
  const rulesDir = join(root, ".cursor", "rules");
  if (existsSync(rulesDir)) {
    try {
      const st = statSync(rulesDir);
      if (st.isDirectory()) {
        const files = readdirSync(rulesDir).filter(
          (name) => name.endsWith(".md") || name.endsWith(".mdc"),
        );
        for (const file of files.slice(0, 20)) {
          hits.push({ path: `.cursor/rules/${file}`, kind: "cursor_rules" });
        }
      }
    } catch {
      // ignore
    }
  }
  return hits;
}

function detectMonorepo(
  root: string,
  pkg: PackageJson | undefined,
): StackDetectionReport["monorepo"] {
  const evidenceList: DetectionEvidence[] = [];
  if (existsSync(join(root, "pnpm-workspace.yaml"))) {
    evidenceList.push(evidence("pnpm-workspace.yaml", "pnpm workspace file"));
    return { detected: true, confidence: "high", evidence: evidenceList };
  }
  if (existsSync(join(root, "lerna.json"))) {
    evidenceList.push(evidence("lerna.json", "lerna config"));
    return { detected: true, confidence: "high", evidence: evidenceList };
  }
  if (pkg?.workspaces !== undefined) {
    evidenceList.push(evidence("package.json", "workspaces field present"));
    return { detected: true, confidence: "high", evidence: evidenceList };
  }
  if (existsSync(join(root, "packages")) || existsSync(join(root, "apps"))) {
    evidenceList.push(evidence("(root)", "packages/ or apps/ directory without workspace file"));
    return { detected: true, confidence: "low", evidence: evidenceList };
  }
  return {
    detected: false,
    confidence: "medium",
    evidence: [evidence("(root)", "no workspace markers")],
  };
}

/**
 * Inspect a project directory without executing any discovered scripts.
 */
export function detectStack(rootPath: string): StackDetectionReport {
  const root = rootPath.trim();
  if (root.length === 0) {
    throw new ProjectProfilesError("invalid_root", "root path must be non-empty");
  }
  if (!existsSync(root)) {
    throw new ProjectProfilesError("root_missing", `Path does not exist: ${root}`);
  }

  const packagePath = "package.json";
  const pkg = asPackageJson(readJsonObject(join(root, packagePath)));
  const packageManager = detectPackageManager(root);
  const scripts = pkg === undefined ? [] : detectScripts(pkg, packagePath);
  const ambiguousScripts = scripts.filter((script) => script.needsConfirmation);

  return {
    rootPath: root,
    packageManager,
    ...(pkg?.name === undefined ? {} : { packageName: pkg.name }),
    ...(pkg?.engines?.node === undefined ? {} : { nodeEngines: pkg.engines.node }),
    frameworks: pkg === undefined ? [] : detectFrameworks(pkg, packagePath),
    scripts,
    instructionFiles: detectInstructionFiles(root),
    monorepo: detectMonorepo(root, pkg),
    sensitivePathHints: [...SENSITIVE_HINTS],
    generatedPathHints: [...GENERATED_HINTS],
    ambiguousScripts,
  };
}

export function packageManagerIdOrUnknown(id: PackageManagerId): PackageManagerId {
  return id;
}
