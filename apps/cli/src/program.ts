import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type AepApplication,
  ApplicationError,
  createApp,
  decidePlanApproval,
  getAuthStatus,
  getRunStatus,
  initProject,
  listAccountModels,
  listNonTerminalRuns,
  requireExplicitApprovalDecision,
  resumeRun,
  runDoctor,
  runTask,
} from "@aep/application";
import { Command, InvalidArgumentError } from "commander";
import { type OutputMode, writeError, writeSuccess } from "./output.js";

function readCliVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = join(here, "..", "package.json");
  const raw = readFileSync(packageJsonPath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "version" in parsed &&
    typeof parsed.version === "string"
  ) {
    return parsed.version;
  }
  return "0.0.0";
}

function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new InvalidArgumentError(`${label} must be non-empty`);
  }
  return trimmed;
}

function resolveMode(program: Command, command: Command): OutputMode {
  const globalOpts = program.opts();
  const localOpts = command.opts();
  return {
    json: globalOpts.json === true || localOpts.json === true,
  };
}

function reportFailure(mode: OutputMode, error: unknown): void {
  if (error instanceof ApplicationError) {
    writeError(mode, error.code, error.message);
    process.exitCode = 1;
    return;
  }
  if (error instanceof Error) {
    writeError(mode, "cli_error", error.message);
    process.exitCode = 1;
    return;
  }
  writeError(mode, "cli_error", String(error));
  process.exitCode = 1;
}

export type BuildProgramOptions = {
  readonly app?: AepApplication;
  readonly exitOverride?: boolean;
};

export function buildProgram(options: BuildProgramOptions = {}): Command {
  const app = options.app ?? createApp();
  const program = new Command();

  program
    .name("aep")
    .description("Agent Engineering Platform CLI")
    .version(readCliVersion(), "-V, --version", "Print CLI version")
    .option("--json", "Machine-readable JSON output where applicable");

  if (options.exitOverride) {
    program.exitOverride();
  }

  program
    .command("doctor")
    .description("Check local host, auth, catalog, usage, and runtime readiness")
    .option("--json", "Machine-readable JSON output")
    .action(async function doctorAction(this: Command) {
      const mode = resolveMode(program, this);
      try {
        const report = await runDoctor(app);
        writeSuccess(
          mode,
          report,
          report.checks
            .map((check) => `${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`)
            .join("\n"),
        );
        if (!report.ok) {
          process.exitCode = 1;
        }
      } catch (error) {
        reportFailure(mode, error);
      }
    });

  const auth = program.command("auth").description("Cursor authentication diagnostics");
  auth
    .command("status")
    .description("Show whether runtime credentials are configured (never prints secrets)")
    .option("--json", "Machine-readable JSON output")
    .action(async function authStatusAction(this: Command) {
      const mode = resolveMode(program, this);
      try {
        const status = await getAuthStatus(app);
        writeSuccess(
          mode,
          status,
          `runtime=${status.runtimeId} ok=${status.ok} credentialConfigured=${status.credentialConfigured} billingOwner=${status.billingOwner}`,
        );
        if (!status.ok) {
          process.exitCode = 1;
        }
      } catch (error) {
        reportFailure(mode, error);
      }
    });

  program
    .command("models")
    .description("List models from the injected runtime account catalog snapshot")
    .option("--json", "Machine-readable JSON output")
    .action(async function modelsAction(this: Command) {
      const mode = resolveMode(program, this);
      try {
        const report = await listAccountModels(app);
        writeSuccess(
          mode,
          report,
          report.models.length === 0
            ? `snapshot=${report.snapshotId} (empty catalog)`
            : report.models
                .map(
                  (model) =>
                    `${model.id} label=${model.label} billing=${model.billingCategory}` +
                    (model.optimizeForValues.length > 0
                      ? ` optimize_for=[${model.optimizeForValues.join(",")}]`
                      : ""),
                )
                .join("\n"),
        );
      } catch (error) {
        reportFailure(mode, error);
      }
    });

  program
    .command("init")
    .description("Create .aep/config.yaml without overwriting existing files")
    .argument("[path]", "Project directory", ".")
    .option("--json", "Machine-readable JSON output")
    .action(async function initAction(this: Command, pathArg: string) {
      const mode = resolveMode(program, this);
      try {
        const result = await initProject(requireNonEmpty(pathArg, "path"));
        writeSuccess(mode, result, `Initialized AEP config at ${result.configPath}`);
      } catch (error) {
        reportFailure(mode, error);
      }
    });

  program
    .command("run")
    .description("Start a workflow run using the injected agent runtime (fake by default)")
    .argument("<task>", "Task description")
    .option("--json", "Machine-readable JSON output")
    .action(async function runAction(this: Command, taskArg: string) {
      const mode = resolveMode(program, this);
      try {
        const result = await runTask(app, {
          task: requireNonEmpty(taskArg, "task"),
          cwd: process.cwd(),
        });
        writeSuccess(
          mode,
          result,
          `runId=${result.runId} status=${result.status} executionId=${result.executionId}`,
        );
      } catch (error) {
        reportFailure(mode, error);
      }
    });

  program
    .command("status")
    .description("Show status for a workflow run id")
    .argument("<run-id>", "Workflow run id")
    .option("--json", "Machine-readable JSON output")
    .action(async function statusAction(this: Command, runIdArg: string) {
      const mode = resolveMode(program, this);
      try {
        const status = getRunStatus(app, requireNonEmpty(runIdArg, "run-id"));
        writeSuccess(
          mode,
          status,
          `runId=${status.runId} status=${status.status} recovery=${status.recoveryClassification} task=${status.taskDescription}`,
        );
      } catch (error) {
        reportFailure(mode, error);
      }
    });

  program
    .command("approve")
    .description("Approve or reject a pending plan (bound to plan hash)")
    .argument("<run-id>", "Workflow run id")
    .option("--approve", "Approve the pending plan")
    .option("--reject", "Reject the pending plan")
    .option("--approver <name>", "Approver identity", "local-user")
    .option("--rationale <text>", "Decision rationale", "CLI decision")
    .option("--json", "Machine-readable JSON output")
    .action(async function approveAction(this: Command, runIdArg: string) {
      const mode = resolveMode(program, this);
      const opts = this.opts();
      try {
        const approve = opts.approve === true;
        const reject = opts.reject === true;
        if (approve && reject) {
          throw new ApplicationError(
            "invalid_approval_flags",
            "Use only one of --approve or --reject",
          );
        }
        requireExplicitApprovalDecision(approve || reject);
        const result = decidePlanApproval(app, {
          runId: requireNonEmpty(runIdArg, "run-id"),
          decision: approve ? "allow" : "deny",
          decidedBy: requireNonEmpty(String(opts.approver), "approver"),
          rationale: requireNonEmpty(String(opts.rationale), "rationale"),
          nonInteractive: true,
        });
        writeSuccess(
          mode,
          result,
          `runId=${result.runId} status=${result.status} decision=${result.approval.decision} hash=${result.approval.subjectHash}`,
        );
      } catch (error) {
        reportFailure(mode, error);
      }
    });

  program
    .command("resume")
    .description("Resume or close a non-terminal workflow run after process restart")
    .argument("<run-id>", "Workflow run id")
    .option("--json", "Machine-readable JSON output")
    .option(
      "--confirm-uncertain",
      "Acknowledge uncertain side effects (marks interrupted under current policy)",
    )
    .option("--mark-interrupted", "Mark the run interrupted without resuming the agent")
    .option("--cancel", "Cancel a safely resumable in-flight agent execution")
    .action(async function resumeAction(this: Command, runIdArg: string) {
      const mode = resolveMode(program, this);
      const opts = this.opts();
      try {
        const result = await resumeRun(app, {
          runId: requireNonEmpty(runIdArg, "run-id"),
          confirmUncertainRetry: opts.confirmUncertain === true,
          markInterrupted: opts.markInterrupted === true,
          cancel: opts.cancel === true,
        });
        writeSuccess(
          mode,
          result,
          `runId=${result.runId} disposition=${result.disposition} status=${result.status}`,
        );
      } catch (error) {
        reportFailure(mode, error);
      }
    });

  program
    .command("recoveries")
    .description("List non-terminal workflow runs detected after restart")
    .option("--json", "Machine-readable JSON output")
    .action(async function recoveriesAction(this: Command) {
      const mode = resolveMode(program, this);
      try {
        const runs = listNonTerminalRuns(app).map((run) => getRunStatus(app, run.runId));
        writeSuccess(
          mode,
          { count: runs.length, runs },
          runs.length === 0
            ? "No non-terminal runs"
            : runs
                .map(
                  (run) =>
                    `${run.runId} status=${run.status} recovery=${run.recoveryClassification}`,
                )
                .join("\n"),
        );
      } catch (error) {
        reportFailure(mode, error);
      }
    });

  return program;
}
