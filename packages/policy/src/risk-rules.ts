import type { RiskLevel } from "@aep/domain";

export type RiskRuleKind = "path" | "task_keyword" | "plan_flag";

export type RiskRule = {
  readonly id: string;
  readonly kind: RiskRuleKind;
  readonly risk: RiskLevel;
  readonly reason: string;
  /** Path globs (posix-ish) when kind is path. */
  readonly pathPatterns?: ReadonlyArray<string>;
  /** Case-insensitive substrings when kind is task_keyword. */
  readonly keywords?: ReadonlyArray<string>;
};

/**
 * Explicit high/critical path patterns (architecture §9.5 / AEP-051).
 * Unknown paths never map to low by themselves.
 */
export const HIGH_RISK_PATH_RULES: ReadonlyArray<RiskRule> = [
  {
    id: "path.secrets",
    kind: "path",
    risk: "high",
    reason: "Touches secret or credential material",
    pathPatterns: [
      "**/.env",
      "**/.env.*",
      "**/*secret*",
      "**/*credential*",
      "**/*password*",
      "**/secrets/**",
      "**/*.pem",
      "**/*.key",
    ],
  },
  {
    id: "path.auth",
    kind: "path",
    risk: "high",
    reason: "Touches authentication or authorization code",
    pathPatterns: [
      "**/auth/**",
      "**/authentication/**",
      "**/authorization/**",
      "**/rbac/**",
      "**/oauth/**",
      "**/*auth*.ts",
      "**/*auth*.tsx",
      "**/*auth*.js",
    ],
  },
  {
    id: "path.payment",
    kind: "path",
    risk: "high",
    reason: "Touches payment or billing code",
    pathPatterns: [
      "**/payment/**",
      "**/payments/**",
      "**/billing/**",
      "**/stripe/**",
      "**/*payment*",
      "**/*billing*",
    ],
  },
  {
    id: "path.crypto",
    kind: "path",
    risk: "high",
    reason: "Touches cryptography-related paths",
    pathPatterns: ["**/crypto/**", "**/kms/**", "**/*cipher*", "**/*encrypt*"],
  },
  {
    id: "path.migrations",
    kind: "path",
    risk: "high",
    reason: "Touches database migrations",
    pathPatterns: [
      "**/migrations/**",
      "**/migration/**",
      "**/*migration*",
      "**/drizzle/**/*.sql",
      "**/prisma/migrations/**",
    ],
  },
  {
    id: "path.ci_cd",
    kind: "path",
    risk: "high",
    reason: "Touches CI/CD configuration",
    pathPatterns: [
      "**/.github/workflows/**",
      "**/.gitlab-ci.yml",
      "**/azure-pipelines*.yml",
      "**/.circleci/**",
      "**/Jenkinsfile*",
      "**/.github/actions/**",
    ],
  },
  {
    id: "path.infra",
    kind: "path",
    risk: "high",
    reason: "Touches infrastructure as code",
    pathPatterns: [
      "**/terraform/**",
      "**/pulumi/**",
      "**/k8s/**",
      "**/kubernetes/**",
      "**/helm/**",
      "**/Dockerfile*",
      "**/docker-compose*.yml",
      "**/docker-compose*.yaml",
      "**/infra/**",
      "**/infrastructure/**",
    ],
  },
];

export const CRITICAL_PATH_RULES: ReadonlyArray<RiskRule> = [
  {
    id: "path.production_destructive",
    kind: "path",
    risk: "critical",
    reason: "Touches production credentials or irreversible ops paths",
    pathPatterns: [
      "**/production/credentials/**",
      "**/prod/secrets/**",
      "**/*prod*credential*",
      "**/deploy/production/**",
    ],
  },
];

export const LOW_PATH_RULES: ReadonlyArray<RiskRule> = [
  {
    id: "path.docs",
    kind: "path",
    risk: "low",
    reason: "Documentation-only paths",
    pathPatterns: ["**/*.md", "**/*.mdx", "**/docs/**", "**/documentation/**", "**/.changeset/**"],
  },
];

export const HIGH_TASK_KEYWORD_RULES: ReadonlyArray<RiskRule> = [
  {
    id: "task.auth",
    kind: "task_keyword",
    risk: "high",
    reason: "Task mentions authentication/security-sensitive work",
    keywords: [
      "auth",
      "oauth",
      "rbac",
      "permission",
      "secret",
      "credential",
      "password",
      "api key",
      "apikey",
    ],
  },
  {
    id: "task.payment",
    kind: "task_keyword",
    risk: "high",
    reason: "Task mentions payment or billing",
    keywords: ["payment", "billing", "stripe", "checkout", "invoice"],
  },
  {
    id: "task.migration",
    kind: "task_keyword",
    risk: "high",
    reason: "Task mentions schema/data migration",
    keywords: ["migration", "migrate schema", "alter table"],
  },
  {
    id: "task.ci_infra",
    kind: "task_keyword",
    risk: "high",
    reason: "Task mentions CI/CD or infrastructure",
    keywords: [
      "ci/cd",
      "github actions",
      "terraform",
      "kubernetes",
      "dockerfile",
      "infrastructure",
      "deploy pipeline",
    ],
  },
];

export const CRITICAL_TASK_KEYWORD_RULES: ReadonlyArray<RiskRule> = [
  {
    id: "task.critical_ops",
    kind: "task_keyword",
    risk: "critical",
    reason: "Task asks for irreversible production operations",
    keywords: [
      "delete production",
      "drop production",
      "wipe production",
      "production credentials",
      "deploy to production",
      "push to production",
      "irreversible",
    ],
  },
];

export const ALL_RISK_RULES: ReadonlyArray<RiskRule> = [
  ...CRITICAL_PATH_RULES,
  ...HIGH_RISK_PATH_RULES,
  ...LOW_PATH_RULES,
  ...CRITICAL_TASK_KEYWORD_RULES,
  ...HIGH_TASK_KEYWORD_RULES,
];
