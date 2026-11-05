import { basename, isAbsolute, normalize } from "node:path";
import { ProcessError } from "./errors.ts";

export type TrustedCommand = {
  readonly id: string;
  /** Executable path or basename (e.g. node, git). */
  readonly executable: string;
};

export class TrustedCommandRegistry {
  private readonly byId = new Map<string, TrustedCommand>();

  constructor(commands: ReadonlyArray<TrustedCommand> = []) {
    for (const command of commands) {
      this.register(command);
    }
  }

  register(command: TrustedCommand): void {
    const id = command.id.trim();
    const executable = command.executable.trim();
    if (id.length === 0 || executable.length === 0) {
      throw new ProcessError("invalid_trusted_command", "command id and executable are required");
    }
    this.byId.set(id, { id, executable });
  }

  resolve(commandId: string): TrustedCommand {
    const found = this.byId.get(commandId);
    if (found === undefined) {
      throw new ProcessError(
        "untrusted_command",
        `Command id "${commandId}" is not in the trusted allowlist`,
      );
    }
    return found;
  }

  /**
   * Reject attempts to smuggle a different basename via argv[0]-style tricks.
   * The runner always launches `executable` from the registry, never from argv.
   */
  assertExecutableSafe(executable: string): string {
    const trimmed = executable.trim();
    if (trimmed.length === 0) {
      throw new ProcessError("invalid_executable", "executable must be non-empty");
    }
    if (trimmed.includes("\0")) {
      throw new ProcessError("invalid_executable", "executable must not contain NUL");
    }
    // Disallow shell metacharacters in the executable path itself.
    if (/[|&;<>`$]/.test(trimmed)) {
      throw new ProcessError(
        "invalid_executable",
        "executable path must not contain shell metacharacters",
      );
    }
    return isAbsolute(trimmed) ? normalize(trimmed) : basename(trimmed);
  }
}
