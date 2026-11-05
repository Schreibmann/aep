import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SecurityError } from "./errors.js";

const BLOCKED_ENV_KEYS = [
  "SSH_AUTH_SOCK",
  "SSH_AGENT_PID",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "AZURE_CLIENT_SECRET",
  "NPM_TOKEN",
  "NODE_AUTH_TOKEN",
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "CURSOR_API_KEY",
] as const;

export type IsolatedEnvInput = {
  readonly worktreePath: string;
  /** Optional existing temp HOME; created under os.tmpdir() when omitted. */
  readonly homeDir?: string;
  readonly extra?: Readonly<Record<string, string>>;
};

export type IsolatedEnv = {
  readonly env: Readonly<Record<string, string>>;
  readonly homeDir: string;
  readonly worktreePath: string;
};

function pickPath(): string | undefined {
  return process.env.PATH ?? process.env.Path;
}

/**
 * Build a minimal child-process environment for agent/SDK workers.
 * Does not forward personal credential locations or CURSOR_API_KEY into the env block
 * (API keys must be passed via SDK options, never prompts/workspace files).
 */
export function buildIsolatedAgentEnv(input: IsolatedEnvInput): IsolatedEnv {
  const homeDir = input.homeDir ?? mkdtempSync(join(tmpdir(), "aep-agent-home-"));
  const pathValue = pickPath();
  if (pathValue === undefined || pathValue.trim().length === 0) {
    throw new SecurityError("missing_path", "PATH is required to build an isolated agent env");
  }

  const env: Record<string, string> = {
    HOME: homeDir,
    TMP: join(homeDir, "tmp"),
    TEMP: join(homeDir, "tmp"),
    TMPDIR: join(homeDir, "tmp"),
    PATH: pathValue,
    AEP_WORKTREE: input.worktreePath,
    // Avoid inheriting user git identity into agents by accident.
    GIT_CONFIG_GLOBAL: join(homeDir, ".gitconfig"),
    GIT_CONFIG_SYSTEM: join(homeDir, "gitconfig.system.null"),
  };

  if (process.platform === "win32") {
    env.USERPROFILE = homeDir;
    env.HOMEDRIVE = homeDir.slice(0, 2);
    env.HOMEPATH = homeDir.slice(2) || "\\";
    env.Path = pathValue;
  }

  if (process.env.SystemRoot !== undefined) {
    env.SystemRoot = process.env.SystemRoot;
  }
  if (process.env.WINDIR !== undefined) {
    env.WINDIR = process.env.WINDIR;
  }
  if (process.env.ComSpec !== undefined) {
    env.ComSpec = process.env.ComSpec;
  }

  if (input.extra !== undefined) {
    for (const [key, value] of Object.entries(input.extra)) {
      if ((BLOCKED_ENV_KEYS as ReadonlyArray<string>).includes(key)) {
        throw new SecurityError(
          "blocked_env_key",
          `Refusing to inject blocked credential env key into agent environment: ${key}`,
        );
      }
      env[key] = value;
    }
  }

  for (const key of BLOCKED_ENV_KEYS) {
    // Ensure blocked keys are absent even if somehow set above.
    delete env[key];
  }

  return {
    env,
    homeDir,
    worktreePath: input.worktreePath,
  };
}

export function listBlockedEnvKeys(): ReadonlyArray<string> {
  return BLOCKED_ENV_KEYS;
}
