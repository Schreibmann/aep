import { constants } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  buildProjectConfigFromDetection,
  detectStack,
  renderProjectConfigYaml,
  type StackDetectionReport,
} from "@aep/project-profiles";
import { ApplicationError } from "./errors.ts";

export type InitProjectInput = {
  readonly targetPath: string;
  /** Explicitly approved gate script names (from CLI/UI). */
  readonly approvedGateScripts?: ReadonlyArray<string>;
  /** Auto-approve exact high-confidence gate script names from detection. */
  readonly autoApproveExactGates?: boolean;
  readonly allowlistedModelIds?: ReadonlyArray<string>;
  readonly now?: () => string;
};

export type InitProjectResult = {
  readonly projectPath: string;
  readonly configPath: string;
  readonly created: boolean;
  readonly detection: StackDetectionReport;
  readonly preservedInstructionFiles: ReadonlyArray<string>;
  readonly pendingGateConfirmations: ReadonlyArray<string>;
};

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Idempotent project init: detect stack, write `.aep/config.yaml` once.
 * Never overwrites AGENTS.md / CLAUDE.md / .cursor rules or an existing config.
 * Never writes secrets.
 */
export async function initProject(input: InitProjectInput | string): Promise<InitProjectResult> {
  const options: InitProjectInput =
    typeof input === "string" ? { targetPath: input, autoApproveExactGates: true } : input;

  const projectPath = resolve(options.targetPath);
  const aepDir = join(projectPath, ".aep");
  const configPath = join(aepDir, "config.yaml");

  if (await pathExists(configPath)) {
    throw new ApplicationError(
      "config_exists",
      `Refusing to overwrite existing config at ${configPath}`,
    );
  }

  const detection = detectStack(projectPath);
  const preservedInstructionFiles = detection.instructionFiles.map((file) => file.path);

  // Refuse to touch existing instruction files (we never write them here).
  for (const relative of ["AGENTS.md", "CLAUDE.md", ".cursor/hooks.json"] as const) {
    if (await pathExists(join(projectPath, relative))) {
      // preserved — no write
    }
  }

  const config = buildProjectConfigFromDetection({
    detection,
    ...(options.approvedGateScripts === undefined
      ? {}
      : { approvedGateScripts: options.approvedGateScripts }),
    autoApproveExactGates: options.autoApproveExactGates !== false,
    ...(options.allowlistedModelIds === undefined
      ? {}
      : { allowlistedModelIds: options.allowlistedModelIds }),
    detectedAt: (options.now ?? (() => new Date().toISOString()))(),
  });

  const yaml = renderProjectConfigYaml(config);
  if (/api[_-]?key|secret|token|password/i.test(yaml) && /:\s*["']?sk-/.test(yaml)) {
    throw new ApplicationError(
      "secret_in_config",
      "Refusing to write secret-like values into config",
    );
  }

  await mkdir(aepDir, { recursive: true });
  await writeFile(configPath, yaml, { encoding: "utf8", flag: "wx" });

  return {
    projectPath,
    configPath,
    created: true,
    detection,
    preservedInstructionFiles,
    pendingGateConfirmations: config.gates.pendingConfirmation,
  };
}
