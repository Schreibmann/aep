import { pathMatchesAny } from "@aep/policy";

/**
 * Paths newly written by Implementer must match approved plan prefixes/globs.
 * Returns out-of-scope paths (empty when all allowed).
 */
export function findOutOfScopePaths(
  changedPaths: ReadonlyArray<string>,
  approvedPatterns: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const patterns =
    approvedPatterns.length === 0
      ? []
      : approvedPatterns.flatMap((pattern) => {
          const trimmed = pattern.trim();
          if (trimmed.length === 0) {
            return [];
          }
          // Exact path also matches as prefix glob for nested files under a directory hint.
          if (trimmed.endsWith("/**") || trimmed.includes("*")) {
            return [trimmed];
          }
          return [trimmed, `${trimmed}/**`];
        });

  if (patterns.length === 0) {
    return [...changedPaths];
  }

  return changedPaths.filter((path) => !pathMatchesAny(path, patterns));
}
