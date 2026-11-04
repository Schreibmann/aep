import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type AepApplication,
  ApplicationError,
  createApp,
  getRunStatus,
  initProject,
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
    .description("Check local host and injected agent runtime readiness")
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
          `runId=${status.runId} status=${status.status} task=${status.taskDescription}`,
        );
      } catch (error) {
        reportFailure(mode, error);
      }
    });

  return program;
}
