import { z } from "zod";

export const AEP_CONFIG_VERSION = 1 as const;

export const aepProjectConfigSchema = z.object({
  version: z.literal(AEP_CONFIG_VERSION),
  runtime: z.enum(["fake", "cursor"]).default("fake"),
  sandbox: z.object({
    enabled: z.literal(true).default(true),
  }),
  packageManager: z.enum(["pnpm", "npm", "yarn", "unknown"]).optional(),
  limits: z.object({
    maxFixCycles: z.number().int().min(0).default(2),
  }),
  gates: z.object({
    /** Script names explicitly approved by the human during init. */
    approvedScriptNames: z.array(z.string().trim().min(1)).default([]),
    /** Ambiguous detections awaiting confirmation (never auto-run). */
    pendingConfirmation: z.array(z.string().trim().min(1)).default([]),
  }),
  models: z
    .object({
      allowlistedModelIds: z.array(z.string().trim().min(1)).default([]),
      allowPotentialExtraCharge: z.boolean().default(false),
    })
    .default({
      allowlistedModelIds: [],
      allowPotentialExtraCharge: false,
    }),
  detection: z
    .object({
      packageName: z.string().optional(),
      frameworks: z.array(z.string()).default([]),
      detectedAt: z.string().optional(),
    })
    .optional(),
});

export type AepProjectConfig = z.infer<typeof aepProjectConfigSchema>;

export function parseAepProjectConfig(value: unknown): AepProjectConfig {
  return aepProjectConfigSchema.parse(value);
}
