import { QualityGatesError } from "./errors.ts";

export type GateClass =
  | "lint"
  | "typecheck"
  | "unit"
  | "build"
  | "format"
  | "security"
  | "integration";

export type GatePhase = "fast" | "full";

export type GateDefinition = {
  readonly id: string;
  readonly gateClass: GateClass;
  /** TrustedCommandRegistry id — never taken from model text. */
  readonly commandId: string;
  /** Exact argv for SafeCommandRunner (no shell). */
  readonly argv: ReadonlyArray<string>;
  readonly required: boolean;
  readonly phase: GatePhase;
  readonly timeoutMs: number;
};

/**
 * Trusted package.json script names → gate mapping.
 * Script *bodies* are never parsed into argv; only the script name is passed to `pnpm run`.
 */
const SCRIPT_GATE_MAP: ReadonlyArray<{
  readonly scriptNames: ReadonlyArray<string>;
  readonly gateClass: GateClass;
  readonly id: string;
  readonly phase: GatePhase;
  readonly timeoutMs: number;
}> = [
  {
    scriptNames: ["lint"],
    gateClass: "lint",
    id: "lint",
    phase: "fast",
    timeoutMs: 120_000,
  },
  {
    scriptNames: ["typecheck", "type-check"],
    gateClass: "typecheck",
    id: "typecheck",
    phase: "fast",
    timeoutMs: 180_000,
  },
  {
    scriptNames: ["test", "test:unit", "unit"],
    gateClass: "unit",
    id: "unit",
    phase: "fast",
    timeoutMs: 300_000,
  },
  {
    scriptNames: ["build"],
    gateClass: "build",
    id: "build",
    phase: "full",
    timeoutMs: 300_000,
  },
  {
    scriptNames: ["format", "fmt"],
    gateClass: "format",
    id: "format",
    phase: "fast",
    timeoutMs: 120_000,
  },
];

export type ProjectGateProfile = {
  readonly packageManagerCommandId: "pnpm" | "npm" | "yarn";
  readonly scripts: Readonly<Record<string, string>>;
  /**
   * When set, only these package.json script names may become gates.
   * Pending / unapproved scripts are never executed.
   */
  readonly approvedScriptNames?: ReadonlyArray<string>;
};

/**
 * Build gate definitions from a trusted project profile (package.json scripts keys only).
 * Arbitrary model/plan command strings MUST NOT be passed here as argv.
 */
export function createGatesFromProjectProfile(
  profile: ProjectGateProfile,
): ReadonlyArray<GateDefinition> {
  const scriptNames = new Set(Object.keys(profile.scripts));
  const approved =
    profile.approvedScriptNames === undefined ? undefined : new Set(profile.approvedScriptNames);
  const gates: GateDefinition[] = [];

  for (const mapping of SCRIPT_GATE_MAP) {
    const matched = mapping.scriptNames.find((name) => {
      if (!scriptNames.has(name)) {
        return false;
      }
      if (approved !== undefined && !approved.has(name)) {
        return false;
      }
      return true;
    });
    if (matched === undefined) {
      continue;
    }
    gates.push({
      id: mapping.id,
      gateClass: mapping.gateClass,
      commandId: profile.packageManagerCommandId,
      argv: ["run", matched],
      required: true,
      phase: mapping.phase,
      timeoutMs: mapping.timeoutMs,
    });
  }

  return gates;
}

/**
 * Reject attempts to turn free-form model text into a runnable gate command.
 */
export function assertTrustedGateArgv(argv: ReadonlyArray<string>): void {
  for (const arg of argv) {
    if (arg.includes("\0") || /[|&;<>`$]/.test(arg)) {
      throw new QualityGatesError(
        "untrusted_gate_argv",
        "Gate argv must not contain shell metacharacters or NUL",
      );
    }
  }
}

export function selectGatesForPhase(
  gates: ReadonlyArray<GateDefinition>,
  phase: GatePhase | "all",
): ReadonlyArray<GateDefinition> {
  if (phase === "all") {
    return [...gates].sort((a, b) => {
      if (a.phase === b.phase) {
        return a.id.localeCompare(b.id);
      }
      return a.phase === "fast" ? -1 : 1;
    });
  }
  return gates.filter((gate) => gate.phase === phase);
}
