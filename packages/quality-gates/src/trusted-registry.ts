import { TrustedCommandRegistry } from "@aep/process";

/**
 * Minimal package-manager allowlist for gate execution.
 * Executable basenames only — argv never carries the executable.
 */
export function createGateCommandRegistry(): TrustedCommandRegistry {
  return new TrustedCommandRegistry([
    { id: "pnpm", executable: "pnpm" },
    { id: "npm", executable: "npm" },
    { id: "yarn", executable: "yarn" },
    { id: "node", executable: "node" },
  ]);
}
