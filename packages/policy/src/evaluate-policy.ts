import {
  createPolicyVerdict,
  type PolicyDecision,
  type PolicyVerdict,
  type RiskLevel,
} from "@aep/domain";
import type { RiskClassification } from "./classify-risk.js";

export type PolicyRequirements = {
  readonly requireHumanApproval: boolean;
  readonly requireReviewer: boolean;
  readonly requireStrengthenedGates: boolean;
  /** Critical work is analysis-only in v1 — Orchestrator must not start writers. */
  readonly allowAgentWriteExecution: boolean;
};

export type RiskPolicyResult = {
  readonly classification: RiskClassification;
  readonly verdict: PolicyVerdict;
  readonly requirements: PolicyRequirements;
};

function decisionForRisk(risk: RiskLevel): PolicyDecision {
  switch (risk) {
    case "critical":
      return "deny";
    case "high":
    case "medium":
    case "low":
      // MVP: human approval before first write for every risk level.
      return "require_approval";
    default: {
      const _exhaustive: never = risk;
      return _exhaustive;
    }
  }
}

function requirementsForRisk(risk: RiskLevel): PolicyRequirements {
  switch (risk) {
    case "low":
      return {
        requireHumanApproval: true,
        requireReviewer: true,
        requireStrengthenedGates: false,
        allowAgentWriteExecution: true,
      };
    case "medium":
      return {
        requireHumanApproval: true,
        requireReviewer: true,
        requireStrengthenedGates: false,
        allowAgentWriteExecution: true,
      };
    case "high":
      return {
        requireHumanApproval: true,
        requireReviewer: true,
        requireStrengthenedGates: true,
        allowAgentWriteExecution: true,
      };
    case "critical":
      return {
        requireHumanApproval: true,
        requireReviewer: true,
        requireStrengthenedGates: true,
        allowAgentWriteExecution: false,
      };
    default: {
      const _exhaustive: never = risk;
      return _exhaustive;
    }
  }
}

/**
 * Map a risk classification to a domain PolicyVerdict + operational requirements.
 * Critical cannot be allowed; uncertain never becomes low (handled in classifyRisk).
 */
export function evaluateRiskPolicy(classification: RiskClassification): RiskPolicyResult {
  if (classification.uncertain && classification.risk === "low") {
    // Fail closed: never honor an inconsistent uncertain+low pair.
    const corrected: RiskClassification = {
      ...classification,
      risk: "medium",
      matched: [
        ...classification.matched,
        {
          id: "guard.uncertain_not_low",
          risk: "medium",
          reason: "Uncertain risk cannot be low; upgraded to medium",
          evidence: "uncertain=true",
        },
      ],
    };
    return evaluateRiskPolicy(corrected);
  }

  const decision = decisionForRisk(classification.risk);
  const primary = classification.matched[0]?.reason ?? `Risk classified as ${classification.risk}`;
  const verdict = createPolicyVerdict({
    decision,
    risk: classification.risk,
    reason: primary,
  });

  return {
    classification,
    verdict,
    requirements: requirementsForRisk(classification.risk),
  };
}
