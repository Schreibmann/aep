import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CURSOR_SDK_MIN_NODE,
  CURSOR_SDK_PACKAGE,
  CURSOR_SDK_PINNED_VERSION,
} from "../src/index.ts";

type CheckResult = {
  id: string;
  ok: boolean;
  detail: string;
};

type PackageJsonShape = {
  name?: string;
  version?: string;
  engines?: {
    node?: string;
  };
};

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");
const results: CheckResult[] = [];

function record(id: string, ok: boolean, detail: string): void {
  results.push({ id, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`[${mark}] ${id}: ${detail}`);
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((part) => Number(part));
  const pb = b.split(".").map((part) => Number(part));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const av = pa[i] ?? 0;
    const bv = pb[i] ?? 0;
    if (Number.isNaN(av) || Number.isNaN(bv)) {
      return Number.NaN;
    }
    if (av > bv) {
      return 1;
    }
    if (av < bv) {
      return -1;
    }
  }
  return 0;
}

function readPackageJson(path: string): PackageJsonShape {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`Invalid package.json at ${path}`);
  }
  const name = "name" in raw && typeof raw.name === "string" ? raw.name : undefined;
  const version = "version" in raw && typeof raw.version === "string" ? raw.version : undefined;
  let nodeEngine: string | undefined;
  if ("engines" in raw && typeof raw.engines === "object" && raw.engines !== null) {
    const engines = raw.engines;
    if ("node" in engines && typeof engines.node === "string") {
      nodeEngine = engines.node;
    }
  }
  return {
    name,
    version,
    engines: nodeEngine === undefined ? undefined : { node: nodeEngine },
  };
}

function findPlatformHelper(sdkEntry: string, helperName: string): string | undefined {
  const shortName = helperName.replace(/^@cursor\//, "");
  let dir = dirname(sdkEntry);
  for (let i = 0; i < 10; i += 1) {
    const candidates = [
      join(dir, "@cursor", shortName),
      join(dir, "node_modules", "@cursor", shortName),
    ];
    for (const candidate of candidates) {
      if (existsSync(join(candidate, "package.json"))) {
        return candidate;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return undefined;
}

const nodeVersion = process.versions.node;
record(
  "node-version",
  compareSemver(nodeVersion, CURSOR_SDK_MIN_NODE) >= 0,
  `running Node ${nodeVersion}; SDK requires >= ${CURSOR_SDK_MIN_NODE}`,
);

const sdkPkgPath = join(pkgRoot, "node_modules", CURSOR_SDK_PACKAGE, "package.json");
const sdkPkg = readPackageJson(sdkPkgPath);

record(
  "sdk-package-pin",
  sdkPkg.name === CURSOR_SDK_PACKAGE && sdkPkg.version === CURSOR_SDK_PINNED_VERSION,
  `resolved ${sdkPkg.name}@${sdkPkg.version}; expected ${CURSOR_SDK_PACKAGE}@${CURSOR_SDK_PINNED_VERSION}`,
);

record(
  "sdk-engines",
  typeof sdkPkg.engines?.node === "string" && sdkPkg.engines.node.includes("22.13"),
  `sdk engines.node=${sdkPkg.engines?.node ?? "missing"}`,
);

const sdk = await import("@cursor/sdk");
record(
  "sdk-import",
  (typeof sdk.Agent === "function" || typeof sdk.Agent === "object") &&
    (typeof sdk.Cursor === "function" || typeof sdk.Cursor === "object"),
  `exports Agent=${typeof sdk.Agent}, Cursor=${typeof sdk.Cursor}`,
);

record(
  "sdk-agent-api",
  typeof sdk.Agent.create === "function" &&
    typeof sdk.Agent.resume === "function" &&
    typeof sdk.Agent.getUsage === "function",
  "Agent.create/resume/getUsage present",
);

record(
  "sdk-models-api",
  typeof sdk.Cursor.models?.list === "function",
  "Cursor.models.list present",
);

record(
  "sdk-auth-api",
  typeof sdk.Cursor.auth?.login === "function" && typeof sdk.Cursor.auth?.status === "function",
  "Cursor.auth.login/status present",
);

const platform = `${process.platform}-${process.arch}`;
const helperName = `@cursor/sdk-${process.platform}-${process.arch}`;
const sdkEntry = require.resolve("@cursor/sdk");
const helperFound = findPlatformHelper(sdkEntry, helperName);

record(
  "sdk-platform-helper",
  helperFound !== undefined,
  helperFound === undefined
    ? `no platform helper resolved for ${platform}; expected optional dep ${helperName}`
    : `resolved ${helperName} via ${helperFound}`,
);

const failed = results.filter((result) => !result.ok);
console.log(`\nOffline checks: ${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  process.exitCode = 1;
}
