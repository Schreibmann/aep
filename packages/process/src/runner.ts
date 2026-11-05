import { spawn } from "node:child_process";
import { ProcessError } from "./errors.ts";
import { killProcessTree } from "./kill-tree.ts";
import { redactText, truncateUtf8 } from "./redact.ts";
import type { TrustedCommandRegistry } from "./registry.ts";

export type RunCommandInput = {
  readonly commandId: string;
  /** Arguments only — never includes the executable. */
  readonly argv: ReadonlyArray<string>;
  readonly cwd: string;
  /** Env keys forwarded from the current process environment. */
  readonly envAllowlist?: ReadonlyArray<string>;
  readonly envExtra?: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly maxStdoutBytes: number;
  readonly maxStderrBytes: number;
  readonly redactSecrets?: ReadonlyArray<string>;
};

export type RunCommandResult = {
  readonly commandId: string;
  readonly executable: string;
  readonly argv: ReadonlyArray<string>;
  readonly cwd: string;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly timedOut: boolean;
  readonly durationMs: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly stdoutTruncated: boolean;
  readonly stderrTruncated: boolean;
};

function buildEnv(
  allowlist: ReadonlyArray<string> | undefined,
  extra: Readonly<Record<string, string>> | undefined,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  // Minimal baseline so Windows/Unix can resolve system DLLs / locales when needed.
  if (process.env.SystemRoot !== undefined) {
    env.SystemRoot = process.env.SystemRoot;
  }
  if (process.env.WINDIR !== undefined) {
    env.WINDIR = process.env.WINDIR;
  }
  if (process.env.PATH !== undefined) {
    env.PATH = process.env.PATH;
  }
  if (process.env.Path !== undefined) {
    env.Path = process.env.Path;
  }

  if (allowlist !== undefined) {
    for (const key of allowlist) {
      const value = process.env[key];
      if (value !== undefined) {
        env[key] = value;
      }
    }
  }
  if (extra !== undefined) {
    for (const [key, value] of Object.entries(extra)) {
      env[key] = value;
    }
  }
  return env;
}

export class SafeCommandRunner {
  private readonly registry: TrustedCommandRegistry;

  constructor(registry: TrustedCommandRegistry) {
    this.registry = registry;
  }

  async run(input: RunCommandInput): Promise<RunCommandResult> {
    if (!Number.isFinite(input.timeoutMs) || input.timeoutMs <= 0) {
      throw new ProcessError("invalid_timeout", "timeoutMs must be a positive number");
    }
    if (!Number.isFinite(input.maxStdoutBytes) || input.maxStdoutBytes < 0) {
      throw new ProcessError("invalid_limit", "maxStdoutBytes must be >= 0");
    }
    if (!Number.isFinite(input.maxStderrBytes) || input.maxStderrBytes < 0) {
      throw new ProcessError("invalid_limit", "maxStderrBytes must be >= 0");
    }
    for (const arg of input.argv) {
      if (arg.includes("\0")) {
        throw new ProcessError("invalid_argv", "argv entries must not contain NUL");
      }
    }

    const trusted = this.registry.resolve(input.commandId);
    const executable = this.registry.assertExecutableSafe(trusted.executable);
    const started = Date.now();

    return await new Promise<RunCommandResult>((resolvePromise, rejectPromise) => {
      let settled = false;
      let timedOut = false;
      let stdoutBuf = Buffer.alloc(0);
      let stderrBuf = Buffer.alloc(0);
      let stdoutTruncated = false;
      let stderrTruncated = false;

      const child = spawn(executable, [...input.argv], {
        cwd: input.cwd,
        env: buildEnv(input.envAllowlist, input.envExtra),
        shell: false,
        windowsHide: true,
      });

      const timer = setTimeout(() => {
        timedOut = true;
        if (child.pid !== undefined) {
          killProcessTree(child.pid);
        }
      }, input.timeoutMs);

      child.stdout?.on("data", (chunk: Buffer) => {
        if (stdoutTruncated) {
          return;
        }
        const next = Buffer.concat([stdoutBuf, chunk]);
        if (next.byteLength > input.maxStdoutBytes) {
          stdoutBuf = next.subarray(0, input.maxStdoutBytes);
          stdoutTruncated = true;
          return;
        }
        stdoutBuf = next;
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        if (stderrTruncated) {
          return;
        }
        const next = Buffer.concat([stderrBuf, chunk]);
        if (next.byteLength > input.maxStderrBytes) {
          stderrBuf = next.subarray(0, input.maxStderrBytes);
          stderrTruncated = true;
          return;
        }
        stderrBuf = next;
      });

      child.on("error", (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        rejectPromise(
          new ProcessError("spawn_failed", `Failed to spawn ${executable}: ${error.message}`),
        );
      });

      child.on("close", (exitCode, signal) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        const secrets = input.redactSecrets ?? [];
        const stdout = redactText(stdoutBuf.toString("utf8"), secrets);
        const stderr = redactText(stderrBuf.toString("utf8"), secrets);
        // Re-apply byte caps after redaction growth/shrink is negligible; keep truncation flags.
        const out = truncateUtf8(stdout, input.maxStdoutBytes);
        const err = truncateUtf8(stderr, input.maxStderrBytes);
        resolvePromise({
          commandId: input.commandId,
          executable,
          argv: input.argv,
          cwd: input.cwd,
          exitCode,
          signal,
          timedOut,
          durationMs: Date.now() - started,
          stdout: out.text,
          stderr: err.text,
          stdoutTruncated: stdoutTruncated || out.truncated,
          stderrTruncated: stderrTruncated || err.truncated,
        });
      });
    });
  }
}
