import { sep } from "node:path";

function toPosix(path: string): string {
  return path.split(sep).join("/").replace(/\\/g, "/");
}

/**
 * Convert a posix-ish glob to a RegExp.
 * A leading double-star slash matches zero or more directories (including none),
 * so a pattern like double-star/.env matches .env at the repository root.
 */
function patternToRegExp(pattern: string): RegExp {
  const posix = pattern.replace(/\\/g, "/");
  const parts: string[] = [];
  let i = 0;
  while (i < posix.length) {
    if (posix.startsWith("**/", i)) {
      parts.push("(?:.*/)?");
      i += 3;
      continue;
    }
    if (posix.startsWith("**", i)) {
      parts.push(".*");
      i += 2;
      continue;
    }
    const ch = posix[i];
    if (ch === "*") {
      parts.push("[^/]*");
      i += 1;
      continue;
    }
    if (ch === "?") {
      parts.push("[^/]");
      i += 1;
      continue;
    }
    if (ch !== undefined && /[.+^${}()|[\]\\]/.test(ch)) {
      parts.push(`\\${ch}`);
      i += 1;
      continue;
    }
    if (ch !== undefined) {
      parts.push(ch);
    }
    i += 1;
  }
  return new RegExp(`^${parts.join("")}$`, "i");
}

/** Match a relative path against posix-ish glob patterns (`*` / `**`). */
export function pathMatchesAny(path: string, patterns: ReadonlyArray<string>): boolean {
  const posix = toPosix(path);
  return patterns.some((pattern) => patternToRegExp(pattern).test(posix));
}
