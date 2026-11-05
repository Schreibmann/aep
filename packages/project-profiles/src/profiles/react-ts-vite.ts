import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AepProjectConfig } from "../config-schema.js";
import { detectStack } from "../detect-stack.js";
import { ProjectProfilesError } from "../errors.js";
import { tryLoadAepProjectConfig } from "../load-config.js";
import {
  type ChecklistItem,
  formatChecklistForReviewer,
  selectReviewerChecklist,
} from "../reviewer-checklist.js";
import type { PackageManagerId, StackDetectionReport } from "../types.js";

export const REACT_TS_VITE_PROFILE_ID = "react-ts-vite" as const;

export type GatePackageManagerId = "pnpm" | "npm" | "yarn";

export type ReactTsViteCapabilities = {
  readonly hasReact: boolean;
  readonly hasVite: boolean;
  readonly hasTypescript: boolean;
  readonly hasEslint: boolean;
  readonly hasVitest: boolean;
  readonly hasJest: boolean;
  readonly isMonorepo: boolean;
};

export type ReactTsViteProfile = {
  readonly id: typeof REACT_TS_VITE_PROFILE_ID;
  readonly rootPath: string;
  readonly packageManagerCommandId: GatePackageManagerId;
  readonly packageManagerConfidence: StackDetectionReport["packageManager"]["confidence"];
  readonly scripts: Readonly<Record<string, string>>;
  /** Only these script names may become quality gates. */
  readonly approvedScriptNames: ReadonlyArray<string>;
  readonly pendingConfirmation: ReadonlyArray<string>;
  readonly capabilities: ReactTsViteCapabilities;
  readonly checklist: ReadonlyArray<ChecklistItem>;
  readonly checklistText: string;
  readonly detection: StackDetectionReport;
  readonly config?: AepProjectConfig;
};

function readScripts(cwd: string): Readonly<Record<string, string>> {
  const packagePath = join(cwd, "package.json");
  if (!existsSync(packagePath)) {
    throw new ProjectProfilesError("package_json_missing", `No package.json at ${packagePath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(packagePath, "utf8"));
  } catch {
    throw new ProjectProfilesError("package_json_invalid", "package.json is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new ProjectProfilesError("package_json_invalid", "package.json root must be an object");
  }
  if (!("scripts" in parsed) || typeof parsed.scripts !== "object" || parsed.scripts === null) {
    return {};
  }
  const scripts: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed.scripts)) {
    if (typeof value === "string" && key.trim().length > 0) {
      scripts[key] = value;
    }
  }
  return scripts;
}

function toGatePackageManager(id: PackageManagerId): GatePackageManagerId {
  if (id === "pnpm" || id === "npm" || id === "yarn") {
    return id;
  }
  return "npm";
}

function hasFramework(detection: StackDetectionReport, id: string): boolean {
  return detection.frameworks.some((framework) => framework.id === id);
}

export type ResolveReactTsViteProfileInput = {
  readonly projectRoot: string;
  readonly config?: AepProjectConfig;
  /** When true and no config, refuse to build gates (strict). Default false for fixtures. */
  readonly requireConfig?: boolean;
};

/**
 * Resolve the React/TypeScript/Vite project profile.
 * Gates are limited to script names approved in `.aep/config.yaml` when present.
 * Does not impose Redux, FSD, a router, or a specific test runner.
 */
export function resolveReactTsViteProfile(
  input: ResolveReactTsViteProfileInput | string,
): ReactTsViteProfile {
  const options: ResolveReactTsViteProfileInput =
    typeof input === "string" ? { projectRoot: input } : input;
  const rootPath = options.projectRoot.trim();
  if (rootPath.length === 0) {
    throw new ProjectProfilesError("invalid_root", "project root must be non-empty");
  }

  const detection = detectStack(rootPath);
  const config = options.config ?? tryLoadAepProjectConfig(rootPath);
  if (options.requireConfig === true && config === undefined) {
    throw new ProjectProfilesError(
      "config_missing",
      "AEP config required before resolving approved gates",
    );
  }

  const scripts = readScripts(rootPath);
  const approvedScriptNames =
    config === undefined
      ? Object.keys(scripts).filter((name) =>
          [
            "lint",
            "typecheck",
            "type-check",
            "test",
            "test:unit",
            "unit",
            "build",
            "format",
            "fmt",
          ].includes(name),
        )
      : [...config.gates.approvedScriptNames];

  const pendingConfirmation = config?.gates.pendingConfirmation ?? [
    ...detection.ambiguousScripts.map((script) => script.name),
  ];

  const capabilities: ReactTsViteCapabilities = {
    hasReact: hasFramework(detection, "react"),
    hasVite: hasFramework(detection, "vite"),
    hasTypescript: hasFramework(detection, "typescript"),
    hasEslint: hasFramework(detection, "eslint") || existsSync(join(rootPath, "eslint.config.js")),
    hasVitest: hasFramework(detection, "vitest"),
    hasJest: hasFramework(detection, "jest"),
    isMonorepo: detection.monorepo.detected,
  };

  const checklist = selectReviewerChecklist({
    frameworkIds: detection.frameworks.map((framework) => framework.id),
  });

  return {
    id: REACT_TS_VITE_PROFILE_ID,
    rootPath,
    packageManagerCommandId: toGatePackageManager(
      config?.packageManager ?? detection.packageManager.id,
    ),
    packageManagerConfidence: detection.packageManager.confidence,
    scripts,
    approvedScriptNames,
    pendingConfirmation,
    capabilities,
    checklist,
    checklistText: formatChecklistForReviewer(checklist),
    detection,
    ...(config === undefined ? {} : { config }),
  };
}
