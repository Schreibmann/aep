import type { RunCommandInput, RunCommandResult } from "@aep/process";
import { QualityGatesError } from "./errors.ts";
import {
  assertTrustedGateArgv,
  type GateDefinition,
  type GatePhase,
  selectGatesForPhase,
} from "./gate-definitions.ts";

export type GateCommandRunner = {
  run(input: RunCommandInput): Promise<RunCommandResult>;
};

export type GateRunStatus = "passed" | "failed" | "skipped";

export type GateEvidence = {
  readonly gateId: string;
  readonly gateClass: string;
  readonly commandId: string;
  readonly argv: ReadonlyArray<string>;
  readonly status: GateRunStatus;
  readonly exitCode: number | null;
  readonly durationMs: number;
  readonly stdoutTail: string;
  readonly stderrTail: string;
  readonly required: boolean;
  readonly timedOut: boolean;
};

export type GateEngineResult = {
  readonly ok: boolean;
  readonly blocked: boolean;
  readonly phase: GatePhase | "all";
  readonly evidence: ReadonlyArray<GateEvidence>;
};

export type RunGatesInput = {
  readonly gates: ReadonlyArray<GateDefinition>;
  readonly cwd: string;
  readonly phase: GatePhase | "all";
  readonly runner: GateCommandRunner;
  readonly maxStdoutBytes?: number;
  readonly maxStderrBytes?: number;
};

const DEFAULT_TAIL_BYTES = 8_192;

function toEvidence(gate: GateDefinition, result: RunCommandResult): GateEvidence {
  const passed = result.exitCode === 0 && !result.timedOut;
  return {
    gateId: gate.id,
    gateClass: gate.gateClass,
    commandId: result.commandId,
    argv: result.argv,
    status: passed ? "passed" : "failed",
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    stdoutTail: result.stdout,
    stderrTail: result.stderr,
    required: gate.required,
    timedOut: result.timedOut,
  };
}

/**
 * Execute trusted gate definitions through SafeCommandRunner.
 * Failed required gates set blocked=true (completion must not proceed).
 */
export async function runQualityGates(input: RunGatesInput): Promise<GateEngineResult> {
  if (input.gates.length === 0) {
    throw new QualityGatesError("no_gates", "No gate definitions available for this project");
  }

  const selected = selectGatesForPhase(input.gates, input.phase);
  if (selected.length === 0) {
    throw new QualityGatesError(
      "no_gates_for_phase",
      `No gates configured for phase ${input.phase}`,
    );
  }

  const maxStdout = input.maxStdoutBytes ?? DEFAULT_TAIL_BYTES;
  const maxStderr = input.maxStderrBytes ?? DEFAULT_TAIL_BYTES;
  const evidence: GateEvidence[] = [];
  let blocked = false;

  for (const gate of selected) {
    assertTrustedGateArgv(gate.argv);
    const result = await input.runner.run({
      commandId: gate.commandId,
      argv: gate.argv,
      cwd: input.cwd,
      timeoutMs: gate.timeoutMs,
      maxStdoutBytes: maxStdout,
      maxStderrBytes: maxStderr,
    });
    const item = toEvidence(gate, result);
    evidence.push(item);
    if (item.status === "failed" && gate.required) {
      blocked = true;
      // Continue collecting remaining fast evidence, but mark blocked.
    }
  }

  return {
    ok: !blocked,
    blocked,
    phase: input.phase,
    evidence,
  };
}
