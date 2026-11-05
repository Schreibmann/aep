import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type AepProjectConfig, parseAepProjectConfig } from "./config-schema.js";
import { ProjectProfilesError } from "./errors.js";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Minimal loader for the YAML subset written by `renderProjectConfigYaml`.
 * Avoids a YAML dependency; rejects unexpected shapes via Zod.
 */
export function parseAepProjectConfigYaml(text: string): AepProjectConfig {
  const lines = text.split(/\r?\n/);
  const root: Record<string, unknown> = {};
  let section: string | undefined;
  let listKey: string | undefined;
  let listParent: Record<string, unknown> | undefined;

  const finishList = () => {
    listKey = undefined;
    listParent = undefined;
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+#.*$/, "");
    if (line.trim().length === 0 || line.trimStart().startsWith("#")) {
      continue;
    }

    const indent = raw.match(/^\s*/)?.[0]?.length ?? 0;

    if (indent === 0) {
      finishList();
      section = undefined;
      const m = line.match(/^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$/);
      if (m === null) {
        throw new ProjectProfilesError("config_parse", `Unexpected top-level line: ${raw}`);
      }
      const key = m[1] ?? "";
      const value = (m[2] ?? "").trim();
      if (value.length === 0) {
        section = key;
        const sectionObj: Record<string, unknown> = {};
        root[key] = sectionObj;
      } else {
        root[key] = coerceScalar(value);
      }
      continue;
    }

    if (section === undefined) {
      throw new ProjectProfilesError("config_parse", `Indented line without section: ${raw}`);
    }

    const parent = root[section];
    if (!isPlainRecord(parent)) {
      throw new ProjectProfilesError("config_parse", `Invalid section ${section}`);
    }

    if (indent >= 4 && listKey !== undefined && listParent !== undefined) {
      const trimmed = line.trim();
      if (trimmed === "[]") {
        listParent[listKey] = [];
        finishList();
        continue;
      }
      const itemMatch = trimmed.match(/^-\s+(.*)$/);
      if (itemMatch !== null) {
        const current = listParent[listKey];
        const arr = Array.isArray(current) ? [...current] : [];
        const item = (itemMatch[1] ?? "").trim();
        arr.push(coerceScalar(item));
        listParent[listKey] = arr;
        continue;
      }
    }

    finishList();
    const m = line.trim().match(/^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (m === null) {
      throw new ProjectProfilesError("config_parse", `Unexpected line in ${section}: ${raw}`);
    }
    const key = m[1] ?? "";
    const value = (m[2] ?? "").trim();
    if (value.length === 0) {
      parent[key] = [];
      listKey = key;
      listParent = parent;
    } else if (value === "[]") {
      parent[key] = [];
    } else {
      parent[key] = coerceScalar(value);
    }
  }

  return parseAepProjectConfig(root);
}

function coerceScalar(value: string): string | number | boolean {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (/^-?\d+$/.test(value)) {
    return Number(value);
  }
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function aepConfigPath(projectRoot: string): string {
  return join(projectRoot, ".aep", "config.yaml");
}

export function tryLoadAepProjectConfig(projectRoot: string): AepProjectConfig | undefined {
  const path = aepConfigPath(projectRoot);
  if (!existsSync(path)) {
    return undefined;
  }
  const text = readFileSync(path, "utf8");
  return parseAepProjectConfigYaml(text);
}

export function loadAepProjectConfig(projectRoot: string): AepProjectConfig {
  const loaded = tryLoadAepProjectConfig(projectRoot);
  if (loaded === undefined) {
    throw new ProjectProfilesError(
      "config_missing",
      `No AEP config at ${aepConfigPath(projectRoot)}`,
    );
  }
  return loaded;
}
