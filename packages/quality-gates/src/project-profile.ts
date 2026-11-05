import { readFileSync } from "node:fs";
import { join } from "node:path";
import { QualityGatesError } from "./errors.ts";
import {
  createGatesFromProjectProfile,
  type GateDefinition,
  type ProjectGateProfile,
} from "./gate-definitions.ts";

function readPackageScripts(cwd: string): Readonly<Record<string, string>> {
  const packagePath = join(cwd, "package.json");
  let raw: string;
  try {
    raw = readFileSync(packagePath, "utf8");
  } catch {
    throw new QualityGatesError("package_json_missing", `No package.json at ${packagePath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new QualityGatesError("package_json_invalid", "package.json is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new QualityGatesError("package_json_invalid", "package.json root must be an object");
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

function detectPackageManagerCommandId(cwd: string): ProjectGateProfile["packageManagerCommandId"] {
  try {
    readFileSync(join(cwd, "pnpm-lock.yaml"));
    return "pnpm";
  } catch {
    // continue
  }
  try {
    readFileSync(join(cwd, "yarn.lock"));
    return "yarn";
  } catch {
    // continue
  }
  return "npm";
}

export type LoadProjectGateProfileOptions = {
  readonly approvedScriptNames?: ReadonlyArray<string>;
};

/**
 * Load a trusted gate profile from the project directory (package.json + lockfile).
 */
export function loadProjectGateProfile(
  cwd: string,
  options?: LoadProjectGateProfileOptions,
): ProjectGateProfile {
  return {
    packageManagerCommandId: detectPackageManagerCommandId(cwd),
    scripts: readPackageScripts(cwd),
    ...(options?.approvedScriptNames === undefined
      ? {}
      : { approvedScriptNames: options.approvedScriptNames }),
  };
}

export function loadGateDefinitions(
  cwd: string,
  options?: LoadProjectGateProfileOptions,
): ReadonlyArray<GateDefinition> {
  return createGatesFromProjectProfile(loadProjectGateProfile(cwd, options));
}
