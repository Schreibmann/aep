import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { ProjectProfilesError } from "../errors.js";
import {
  isExcludedKnowledgePath,
  KNOWLEDGE_SOURCE_CANDIDATES,
  knowledgePackPath,
  knowledgePacksDir,
} from "./paths.js";
import { KNOWLEDGE_PACK_SCHEMA_VERSION, type KnowledgePack, parseKnowledgePack } from "./schema.js";

const MAX_PACK_CHARS = 8_000;

function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function packIdFromSource(relativePath: string): string {
  return relativePath
    .replace(/\\/g, "/")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function boundContent(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length <= MAX_PACK_CHARS) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_PACK_CHARS)}\n…[truncated]`;
}

export type BuildKnowledgePacksInput = {
  readonly projectRoot: string;
  readonly now?: () => string;
  /** When false, do not write packs that already exist (preserve maintainer edits). */
  readonly overwriteExisting?: boolean;
};

export type BuildKnowledgePacksResult = {
  readonly created: ReadonlyArray<KnowledgePack>;
  readonly skippedExisting: ReadonlyArray<string>;
  readonly skippedMissing: ReadonlyArray<string>;
  readonly skippedExcluded: ReadonlyArray<string>;
};

/**
 * Create versioned knowledge packs from real project sources only.
 * Does not invent generic instructions. Existing packs are preserved unless overwrite is set.
 */
export function buildKnowledgePacks(input: BuildKnowledgePacksInput): BuildKnowledgePacksResult {
  const root = input.projectRoot.trim();
  if (root.length === 0) {
    throw new ProjectProfilesError("invalid_root", "project root must be non-empty");
  }
  if (!existsSync(root)) {
    throw new ProjectProfilesError("root_missing", `Path does not exist: ${root}`);
  }

  const now = (input.now ?? (() => new Date().toISOString()))();
  const dir = knowledgePacksDir(root);
  mkdirSync(dir, { recursive: true });

  const created: KnowledgePack[] = [];
  const skippedExisting: string[] = [];
  const skippedMissing: string[] = [];
  const skippedExcluded: string[] = [];

  for (const candidate of KNOWLEDGE_SOURCE_CANDIDATES) {
    if (isExcludedKnowledgePath(candidate.relativePath)) {
      skippedExcluded.push(candidate.relativePath);
      continue;
    }
    const absolute = join(root, candidate.relativePath);
    if (!existsSync(absolute)) {
      skippedMissing.push(candidate.relativePath);
      continue;
    }
    const id = packIdFromSource(candidate.relativePath);
    const outPath = knowledgePackPath(root, id);
    if (existsSync(outPath) && input.overwriteExisting !== true) {
      skippedExisting.push(id);
      continue;
    }

    let raw: string;
    try {
      raw = readFileSync(absolute, "utf8");
    } catch {
      skippedMissing.push(candidate.relativePath);
      continue;
    }
    if (raw.trim().length === 0) {
      skippedMissing.push(candidate.relativePath);
      continue;
    }

    // Refuse secret-like payloads even if path slipped through.
    if (
      /^\s*(?:API[_-]?KEY|SECRET|TOKEN|PASSWORD)\s*=/im.test(raw) ||
      /sk-[a-zA-Z0-9]{20,}/.test(raw)
    ) {
      skippedExcluded.push(candidate.relativePath);
      continue;
    }

    const content = boundContent(raw);
    const pack = parseKnowledgePack({
      schemaVersion: KNOWLEDGE_PACK_SCHEMA_VERSION,
      id,
      title: candidate.title,
      category: candidate.category,
      sourcePath: candidate.relativePath.replace(/\\/g, "/"),
      sourceHash: hashContent(raw),
      content,
      reviewed: false,
      createdAt: now,
      updatedAt: now,
    });
    writeFileSync(outPath, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
    created.push(pack);
  }

  return { created, skippedExisting, skippedMissing, skippedExcluded };
}

export function listKnowledgePacks(projectRoot: string): ReadonlyArray<KnowledgePack> {
  const dir = knowledgePacksDir(projectRoot);
  if (!existsSync(dir)) {
    return [];
  }
  const packs: KnowledgePack[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) {
      continue;
    }
    const absolute = join(dir, name);
    try {
      const parsed: unknown = JSON.parse(readFileSync(absolute, "utf8"));
      packs.push(parseKnowledgePack(parsed));
    } catch {
      throw new ProjectProfilesError(
        "knowledge_pack_invalid",
        `Invalid knowledge pack file: ${basename(absolute)}`,
      );
    }
  }
  return packs.sort((a, b) => a.id.localeCompare(b.id));
}

export type UpdateKnowledgePackInput = {
  readonly projectRoot: string;
  readonly packId: string;
  readonly content: string;
  readonly title?: string;
  readonly now?: () => string;
};

/**
 * Maintainer edit path: update content/title and mark reviewed.
 */
export function updateKnowledgePack(input: UpdateKnowledgePackInput): KnowledgePack {
  const packs = listKnowledgePacks(input.projectRoot);
  const existing = packs.find((pack) => pack.id === input.packId);
  if (existing === undefined) {
    throw new ProjectProfilesError(
      "knowledge_pack_missing",
      `No knowledge pack with id ${input.packId}`,
    );
  }
  const now = (input.now ?? (() => new Date().toISOString()))();
  const next = parseKnowledgePack({
    ...existing,
    content: boundContent(input.content),
    ...(input.title === undefined ? {} : { title: input.title.trim() }),
    reviewed: true,
    updatedAt: now,
  });
  writeFileSync(
    knowledgePackPath(input.projectRoot, next.id),
    `${JSON.stringify(next, null, 2)}\n`,
    "utf8",
  );
  return next;
}
