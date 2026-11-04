import { spawnSync } from "node:child_process";
import { GitWorkspacesError } from "./errors.js";

export type GitExecResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number;
};

let cachedGitExecutable: string | undefined;

function resolveGitExecutable(): string {
  if (cachedGitExecutable !== undefined) {
    return cachedGitExecutable;
  }

  if (process.platform === "win32") {
    const where = spawnSync("where.exe", ["git"], {
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    });
    const candidates = (where.stdout ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    // Prefer Git\bin\git.exe over Git\cmd\git.exe (cmd shim is flaky with shell:false).
    const preferred =
      candidates.find((line) => /[/\\]bin[/\\]git\.exe$/i.test(line)) ??
      candidates.find((line) => /git\.exe$/i.test(line) && !/[/\\]cmd[/\\]/i.test(line)) ??
      candidates[0];
    if (preferred !== undefined) {
      cachedGitExecutable = preferred;
      return preferred;
    }
  } else {
    const which = spawnSync("which", ["git"], {
      encoding: "utf8",
      shell: false,
    });
    const first = (which.stdout ?? "").trim();
    if (first.length > 0) {
      cachedGitExecutable = first;
      return first;
    }
  }

  cachedGitExecutable = "git";
  return "git";
}

/**
 * Read-only Git invocation: executable + argv only (no shell).
 * MUST NOT be used for mutating commands in AEP-030 inspection paths.
 */
export function runGit(
  cwd: string,
  args: ReadonlyArray<string>,
  options: { readonly allowFailure?: boolean } = {},
): GitExecResult {
  const gitBin = resolveGitExecutable();
  const result = spawnSync(gitBin, [...args], {
    cwd,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_OPTIONAL_LOCKS: "0",
    },
  });

  if (result.error !== undefined) {
    throw new GitWorkspacesError(
      "git_unavailable",
      `git executable failed to start (${gitBin}): ${result.error.message}`,
    );
  }

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const status = result.status ?? 1;

  if (status !== 0 && options.allowFailure !== true) {
    const detail = stderr.trim() || stdout.trim() || `git exited with status ${status}`;
    throw new GitWorkspacesError("git_command_failed", detail);
  }

  return { stdout, stderr, status };
}
