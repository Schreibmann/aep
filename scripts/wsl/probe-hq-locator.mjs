import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function isExec(p) {
  try {
    const s = fs.statSync(p);
    return s.isFile() && !!(73 & s.mode);
  } catch {
    return false;
  }
}

function findGit(start) {
  let r = path.resolve(start);
  const root = path.parse(r).root;
  for (;;) {
    if (fs.existsSync(path.join(r, ".git"))) return r;
    if (r === root) return undefined;
    r = path.dirname(r);
  }
}

function locate(binaryName, excludedWorkspaceDir) {
  const relativePath = path.join("bin", binaryName);
  const pkgs = [
    `@cursor/sdk-${process.platform}-${process.arch}`,
    `@cursor/february-${process.platform}-${process.arch}`,
  ];
  const excluded = [];
  for (const r of [excludedWorkspaceDir]) {
    excluded.push(path.resolve(r));
    const g = findGit(r);
    if (g !== undefined) excluded.push(g);
  }
  const under = (cand) =>
    excluded.some((d) => {
      const rel = path.relative(path.resolve(d), path.resolve(cand));
      return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
    });
  const starts = [
    {
      startDir: path.dirname(path.resolve(process.argv[1])),
      excludeWorkspaceHelpers: false,
    },
    {
      startDir: path.dirname(path.resolve(process.execPath)),
      excludeWorkspaceHelpers: true,
    },
  ];
  for (const { startDir, excludeWorkspaceHelpers } of starts) {
    let o = startDir;
    const a = path.parse(o).root;
    while (o !== a) {
      for (const t of pkgs) {
        const i = path.join(o, "node_modules", t, relativePath);
        if (isExec(i) && (!excludeWorkspaceHelpers || !under(i))) {
          return { found: i, via: startDir, at: o };
        }
      }
      o = path.dirname(o);
    }
  }
  return { found: null };
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
console.log("argv1", process.argv[1]);
console.log("execPath", process.execPath);
console.log("cwd", process.cwd());
console.log("repo", repo);
console.log(
  "root_has_platform",
  fs.existsSync(path.join(repo, "node_modules/@cursor/sdk-linux-x64/bin/cursorsandbox")),
);
console.log(
  "pkg_has_platform",
  fs.existsSync(
    path.join(repo, "packages/runtime-cursor/node_modules/@cursor/sdk-linux-x64/bin/cursorsandbox"),
  ),
);
console.log(
  "pnpm_has_platform",
  fs.existsSync(
    path.join(
      repo,
      "node_modules/.pnpm/@cursor+sdk@1.3.1_zod@4.6.7/node_modules/@cursor/sdk-linux-x64/bin/cursorsandbox",
    ),
  ),
);
console.log("locate_cwd", locate("cursorsandbox", process.cwd()));
console.log("locate_tmp", locate("cursorsandbox", "/tmp/aep-fake-workspace"));
