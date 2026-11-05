import { z } from "zod";

export const KNOWLEDGE_PACK_SCHEMA_VERSION = 1 as const;

export const knowledgePackCategorySchema = z.enum([
  "conventions",
  "architecture",
  "api_patterns",
  "examples",
  "other",
]);

export type KnowledgePackCategory = z.infer<typeof knowledgePackCategorySchema>;

export const knowledgePackSchema = z.object({
  schemaVersion: z.literal(KNOWLEDGE_PACK_SCHEMA_VERSION),
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  category: knowledgePackCategorySchema,
  /** Relative path of the source file this pack was derived from. */
  sourcePath: z.string().trim().min(1),
  /** SHA-256 hex of the source file bytes at pack creation/update. */
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  /** Maintainer-editable body; initially copied from source (bounded). */
  content: z.string().min(1),
  /** True after a human reviewed/edited the pack. */
  reviewed: z.boolean().default(false),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export type KnowledgePack = z.infer<typeof knowledgePackSchema>;

export function parseKnowledgePack(value: unknown): KnowledgePack {
  return knowledgePackSchema.parse(value);
}
