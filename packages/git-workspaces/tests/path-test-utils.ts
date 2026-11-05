import { execFileSync } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Expand Windows 8.3 short path components (e.g. RUNNER~1 → runneradmin).
 * Node realpathSync alone does not always expand these on GitHub Actions runners.
 */
export function expandPath(pathInput: string): string {
  const absolute = resolve(pathInput);
  if (process.platform === "win32" && absolute.includes("~")) {
    try {
      const out = execFileSync(
        process.env.ComSpec ?? "cmd.exe",
        ["/d", "/s", "/c", `for %I in (${JSON.stringify(absolute)}) do @echo %~fI`],
        { encoding: "utf8", windowsHide: true },
      );
      const lines = out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.toLowerCase().startsWith("echo is"));
      const last = lines[lines.length - 1];
      if (last !== undefined && existsSync(last)) {
        return last;
      }
    } catch {
      // fall through
    }
  }
  try {
    return realpathSync(absolute);
  } catch {
    return absolute;
  }
}

/** True when both paths name the same filesystem location. */
export function samePath(left: string, right: string): boolean {
  const a = expandPath(left);
  const b = expandPath(right);
  if (a === b) {
    return true;
  }
  if (a.toLowerCase() === b.toLowerCase()) {
    return true;
  }
  try {
    const sa = statSync(left);
    const sb = statSync(right);
    return sa.dev === sb.dev && sa.ino !== 0 && sa.ino === sb.ino;
  } catch {
    return false;
  }
}
