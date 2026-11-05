import { listKnowledgePacks } from "./build-packs.ts";
import type { KnowledgePack, KnowledgePackCategory } from "./schema.ts";

/** Rough token estimate (~4 chars/token) for budget accounting. */
export function estimateTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  return Math.ceil(text.length / 4);
}

export type AssembleKnowledgeContextInput = {
  readonly projectRoot: string;
  /** Free-text relevance query (task description, role, etc.). */
  readonly query?: string;
  /** Prefer these categories first when scores tie. */
  readonly preferCategories?: ReadonlyArray<KnowledgePackCategory>;
  /** Soft token budget for assembled context. */
  readonly tokenBudget?: number;
  readonly packs?: ReadonlyArray<KnowledgePack>;
};

export type AssembledKnowledgeChunk = {
  readonly packId: string;
  readonly title: string;
  readonly category: KnowledgePackCategory;
  readonly sourcePath: string;
  readonly sourceHash: string;
  readonly reviewed: boolean;
  readonly content: string;
  readonly relevanceScore: number;
  readonly estimatedTokens: number;
};

export type AssembledKnowledgeContext = {
  readonly chunks: ReadonlyArray<AssembledKnowledgeChunk>;
  readonly totalEstimatedTokens: number;
  readonly omittedPackIds: ReadonlyArray<string>;
  readonly text: string;
};

function scorePack(
  pack: KnowledgePack,
  queryTerms: ReadonlyArray<string>,
  prefer: ReadonlySet<KnowledgePackCategory>,
): number {
  let score = 0;
  if (pack.reviewed) {
    score += 2;
  }
  if (prefer.has(pack.category)) {
    score += 3;
  }
  const haystack =
    `${pack.title}\n${pack.category}\n${pack.sourcePath}\n${pack.content}`.toLowerCase();
  for (const term of queryTerms) {
    if (term.length < 2) {
      continue;
    }
    if (haystack.includes(term)) {
      score += 1;
    }
  }
  // Mild base so packs still assemble when query is empty.
  score += 1;
  return score;
}

/**
 * Assemble knowledge context by relevance score within a token budget.
 * Secrets/generated sources are never included (packs are built from allowlisted paths only).
 */
export function assembleKnowledgeContext(
  input: AssembleKnowledgeContextInput,
): AssembledKnowledgeContext {
  const budget = input.tokenBudget ?? 3_000;
  const packs = input.packs ?? listKnowledgePacks(input.projectRoot);
  const queryTerms = (input.query ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((term) => term.length > 0);
  const prefer = new Set(input.preferCategories ?? []);

  const ranked = [...packs]
    .map((pack) => ({
      pack,
      relevanceScore: scorePack(pack, queryTerms, prefer),
    }))
    .sort((a, b) => {
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      return a.pack.id.localeCompare(b.pack.id);
    });

  const chunks: AssembledKnowledgeChunk[] = [];
  const omitted: string[] = [];
  let total = 0;

  for (const item of ranked) {
    const header = `### ${item.pack.title} (${item.pack.sourcePath}, hash=${item.pack.sourceHash.slice(0, 12)})`;
    const body = `${header}\n${item.pack.content}`;
    const tokens = estimateTokens(body);
    if (total + tokens > budget && chunks.length > 0) {
      omitted.push(item.pack.id);
      continue;
    }
    if (tokens > budget && chunks.length === 0) {
      const sliceChars = Math.max(0, budget * 4 - header.length - 20);
      const truncated = `${header}\n${item.pack.content.slice(0, sliceChars)}\n…[truncated]`;
      const estimatedTokens = estimateTokens(truncated);
      chunks.push({
        packId: item.pack.id,
        title: item.pack.title,
        category: item.pack.category,
        sourcePath: item.pack.sourcePath,
        sourceHash: item.pack.sourceHash,
        reviewed: item.pack.reviewed,
        content: truncated,
        relevanceScore: item.relevanceScore,
        estimatedTokens,
      });
      total += estimatedTokens;
      continue;
    }
    chunks.push({
      packId: item.pack.id,
      title: item.pack.title,
      category: item.pack.category,
      sourcePath: item.pack.sourcePath,
      sourceHash: item.pack.sourceHash,
      reviewed: item.pack.reviewed,
      content: item.pack.content,
      relevanceScore: item.relevanceScore,
      estimatedTokens: tokens,
    });
    total += tokens;
  }

  const text = chunks
    .map((chunk) => {
      if (chunk.content.startsWith("### ")) {
        return chunk.content;
      }
      return `### ${chunk.title} (${chunk.sourcePath}, hash=${chunk.sourceHash.slice(0, 12)})\n${chunk.content}`;
    })
    .join("\n\n");

  return {
    chunks,
    totalEstimatedTokens: total,
    omittedPackIds: omitted,
    text,
  };
}
