import type { RiskLevel } from "@aep/domain";
import { pathMatchesAny } from "./path-match.ts";
import {
  ALL_RISK_RULES,
  CRITICAL_PATH_RULES,
  CRITICAL_TASK_KEYWORD_RULES,
  HIGH_RISK_PATH_RULES,
  HIGH_TASK_KEYWORD_RULES,
  LOW_PATH_RULES,
  type RiskRule,
} from "./risk-rules.ts";

export type MatchedRiskRule = {
  readonly id: string;
  readonly risk: RiskLevel;
  readonly reason: string;
  readonly evidence: string;
};

export type RiskClassifyInput = {
  readonly taskDescription: string;
  readonly touchedPaths: ReadonlyArray<string>;
  readonly mayTouchSecretsOrAuth?: boolean;
  readonly mayNeedNetwork?: boolean;
  /** Optional extra path patterns treated as high risk for this project. */
  readonly extraHighRiskPathPatterns?: ReadonlyArray<string>;
};

export type RiskClassification = {
  readonly risk: RiskLevel;
  readonly matched: ReadonlyArray<MatchedRiskRule>;
  /**
   * True when no explicit low/high/critical signal matched.
   * Uncertain classifications MUST NOT be treated as low.
   */
  readonly uncertain: boolean;
};

const RISK_RANK: Record<RiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_RANK[a] >= RISK_RANK[b] ? a : b;
}

function matchPathRules(
  paths: ReadonlyArray<string>,
  rules: ReadonlyArray<RiskRule>,
): MatchedRiskRule[] {
  const matched: MatchedRiskRule[] = [];
  for (const rule of rules) {
    const patterns = rule.pathPatterns ?? [];
    for (const path of paths) {
      if (pathMatchesAny(path, patterns)) {
        matched.push({
          id: rule.id,
          risk: rule.risk,
          reason: rule.reason,
          evidence: path,
        });
        break;
      }
    }
  }
  return matched;
}

function matchKeywordRules(task: string, rules: ReadonlyArray<RiskRule>): MatchedRiskRule[] {
  const normalized = task.toLowerCase();
  const matched: MatchedRiskRule[] = [];
  for (const rule of rules) {
    const keywords = rule.keywords ?? [];
    for (const keyword of keywords) {
      if (normalized.includes(keyword.toLowerCase())) {
        matched.push({
          id: rule.id,
          risk: rule.risk,
          reason: rule.reason,
          evidence: keyword,
        });
        break;
      }
    }
  }
  return matched;
}

/**
 * Deterministic risk classification from plan paths + task metadata.
 * Safe default: no explicit signal → medium + uncertain (never silent low).
 */
export function classifyRisk(input: RiskClassifyInput): RiskClassification {
  const task = input.taskDescription.trim();
  const paths = input.touchedPaths.map((path) => path.trim()).filter((path) => path.length > 0);

  const matched: MatchedRiskRule[] = [
    ...matchPathRules(paths, CRITICAL_PATH_RULES),
    ...matchPathRules(paths, HIGH_RISK_PATH_RULES),
    ...matchKeywordRules(task, CRITICAL_TASK_KEYWORD_RULES),
    ...matchKeywordRules(task, HIGH_TASK_KEYWORD_RULES),
  ];

  if (input.mayTouchSecretsOrAuth === true) {
    matched.push({
      id: "plan_flag.secrets_or_auth",
      risk: "high",
      reason: "Plan flags possible secret or auth impact",
      evidence: "approvalFlags.mayTouchSecretsOrAuth",
    });
  }

  if (input.mayNeedNetwork === true) {
    matched.push({
      id: "plan_flag.network",
      risk: "high",
      reason: "Plan flags network access need",
      evidence: "approvalFlags.mayNeedNetwork",
    });
  }

  const extra = input.extraHighRiskPathPatterns ?? [];
  if (extra.length > 0) {
    for (const path of paths) {
      if (pathMatchesAny(path, extra)) {
        matched.push({
          id: "path.project_extra_high",
          risk: "high",
          reason: "Matches project-configured high-risk path pattern",
          evidence: path,
        });
        break;
      }
    }
  }

  const elevated = matched.filter((item) => item.risk !== "low");
  if (elevated.length > 0) {
    let risk: RiskLevel = "medium";
    for (const item of elevated) {
      risk = maxRisk(risk, item.risk);
    }
    return {
      risk,
      matched,
      uncertain: false,
    };
  }

  const lowMatches = matchPathRules(paths, LOW_PATH_RULES);
  const allPathsAreLow =
    paths.length > 0 &&
    paths.every((path) =>
      LOW_PATH_RULES.some((rule) => pathMatchesAny(path, rule.pathPatterns ?? [])),
    );

  if (allPathsAreLow && lowMatches.length > 0) {
    return {
      risk: "low",
      matched: lowMatches,
      uncertain: false,
    };
  }

  // No explicit high/critical and not clearly docs-only → medium + uncertain.
  return {
    risk: "medium",
    matched:
      lowMatches.length > 0
        ? lowMatches
        : [
            {
              id: "default.uncertain_medium",
              risk: "medium",
              reason: "No explicit risk signal; defaulting to medium (never silent low)",
              evidence: paths.length === 0 ? "(no paths)" : paths.join(", "),
            },
          ],
    uncertain: true,
  };
}

export function listConfiguredRiskRules(): ReadonlyArray<RiskRule> {
  return ALL_RISK_RULES;
}
