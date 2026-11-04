import { access, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import { ApplicationError } from "./errors.js";

export type InitProjectResult = {
  readonly projectPath: string;
  readonly configPath: string;
  readonly created: boolean;
};

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

const DEFAULT_CONFIG = `# AEP project config (skeleton)
version: 1
runtime: fake
sandbox:
  enabled: true
limits:
  maxFixCycles: 2
`;

/**
 * Creates `.aep/config.yaml` without overwriting existing user files.
 */
export async function initProject(targetPath: string): Promise<InitProjectResult> {
  const projectPath = resolve(targetPath);
  const aepDir = join(projectPath, ".aep");
  const configPath = join(aepDir, "config.yaml");

  if (await pathExists(configPath)) {
    throw new ApplicationError(
      "config_exists",
      `Refusing to overwrite existing config at ${configPath}`,
    );
  }

  await mkdir(aepDir, { recursive: true });
  await writeFile(configPath, DEFAULT_CONFIG, { encoding: "utf8", flag: "wx" });

  return {
    projectPath,
    configPath,
    created: true,
  };
}
