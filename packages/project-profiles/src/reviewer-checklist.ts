import { z } from "zod";

export const CHECKLIST_VERSION = "1" as const;

export const checklistItemSchema = z.object({
  id: z.string().min(1),
  category: z.enum([
    "hooks",
    "async_state",
    "props_types",
    "forms",
    "routing",
    "data_fetching",
    "accessibility",
    "typescript",
    "build",
  ]),
  prompt: z.string().min(1),
  /** Only include when these framework ids were detected. Empty = always. */
  requiresFrameworks: z.array(z.string()).default([]),
});

export type ChecklistItem = z.infer<typeof checklistItemSchema>;

/**
 * Versioned React/TypeScript reviewer checklist (data, not a free-form prompt dump).
 * Items that require a framework are omitted when that framework is not in the project.
 */
export const REACT_TS_VITE_CHECKLIST: ReadonlyArray<ChecklistItem> = [
  {
    id: "ts-props",
    category: "props_types",
    prompt: "Props and public component APIs have accurate TypeScript types; avoid any/assertions.",
    requiresFrameworks: ["typescript"],
  },
  {
    id: "ts-nullability",
    category: "typescript",
    prompt: "Nullable and optional values are handled before render or call sites.",
    requiresFrameworks: ["typescript"],
  },
  {
    id: "hooks-rules",
    category: "hooks",
    prompt: "Hooks follow Rules of Hooks; effects declare dependencies and clean up subscriptions.",
    requiresFrameworks: ["react"],
  },
  {
    id: "async-ui",
    category: "async_state",
    prompt: "Loading, empty, and error UI states are represented for async work.",
    requiresFrameworks: ["react"],
  },
  {
    id: "forms",
    category: "forms",
    prompt: "Form inputs validate before submit; invalid states are visible to the user.",
    requiresFrameworks: ["react"],
  },
  {
    id: "routing",
    category: "routing",
    prompt: "Route params and search params are validated; missing routes fail safely.",
    requiresFrameworks: ["react"],
  },
  {
    id: "data-fetch",
    category: "data_fetching",
    prompt: "Data fetching handles abort/unmount and does not trust unvalidated remote shapes.",
    requiresFrameworks: ["react"],
  },
  {
    id: "a11y",
    category: "accessibility",
    prompt: "Interactive controls are keyboard reachable and have accessible names where relevant.",
    requiresFrameworks: ["react"],
  },
  {
    id: "vite-build",
    category: "build",
    prompt: "Production build scripts remain trustworthy; no secrets in client bundles.",
    requiresFrameworks: ["vite"],
  },
];

export type SelectChecklistInput = {
  readonly frameworkIds: ReadonlyArray<string>;
  readonly items?: ReadonlyArray<ChecklistItem>;
};

export function selectReviewerChecklist(input: SelectChecklistInput): ReadonlyArray<ChecklistItem> {
  const frameworkSet = new Set(input.frameworkIds);
  const source = input.items ?? REACT_TS_VITE_CHECKLIST;
  return source.filter((item) => {
    if (item.requiresFrameworks.length === 0) {
      return true;
    }
    return item.requiresFrameworks.every((id) => frameworkSet.has(id));
  });
}

export function formatChecklistForReviewer(items: ReadonlyArray<ChecklistItem>): string {
  if (items.length === 0) {
    return "";
  }
  return [
    `Project reviewer checklist (v${CHECKLIST_VERSION}):`,
    ...items.map((item) => `- [${item.category}] ${item.prompt}`),
  ].join("\n");
}
