import { readFileSync } from "node:fs";
import { join } from "node:path";

const CONTEXT_FILES = ["AGENTS.md", "CLAUDE.md", "package.json", "README.md"] as const;

const MAX_FILE_CHARS = 4_000;
const MAX_TOTAL_CHARS = 12_000;

function readBounded(path: string, maxChars: number): string | undefined {
  try {
    const raw = readFileSync(path, "utf8");
    if (raw.trim().length === 0) {
      return undefined;
    }
    if (raw.length <= maxChars) {
      return raw;
    }
    return `${raw.slice(0, maxChars)}\n…[truncated]`;
  } catch {
    return undefined;
  }
}

function summarizePackageJson(raw: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return undefined;
    }
    const name = "name" in parsed && typeof parsed.name === "string" ? parsed.name : undefined;
    const scripts =
      "scripts" in parsed && typeof parsed.scripts === "object" && parsed.scripts !== null
        ? Object.keys(parsed.scripts)
        : [];
    const lines = [
      name === undefined ? "package.json" : `package name: ${name}`,
      scripts.length > 0 ? `scripts: ${scripts.join(", ")}` : "scripts: (none)",
    ];
    return lines.join("\n");
  } catch {
    return undefined;
  }
}

/**
 * Gather a small, non-secret project context for the Planner.
 * Does not recurse the tree or load .env / credentials.
 */
export function gatherPlannerProjectContext(cwd: string): string {
  const chunks: string[] = [];
  let total = 0;
  for (const name of CONTEXT_FILES) {
    if (total >= MAX_TOTAL_CHARS) {
      break;
    }
    const absolute = join(cwd, name);
    const raw = readBounded(absolute, MAX_FILE_CHARS);
    if (raw === undefined) {
      continue;
    }
    const body = name === "package.json" ? (summarizePackageJson(raw) ?? raw) : raw;
    const block = `### ${name}\n${body}`;
    if (total + block.length > MAX_TOTAL_CHARS) {
      chunks.push(block.slice(0, MAX_TOTAL_CHARS - total));
      break;
    }
    chunks.push(block);
    total += block.length;
  }
  return chunks.join("\n\n");
}
