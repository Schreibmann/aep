/**
 * Bootstrap identity for the AEP monorepo until domain packages land (AEP-010+).
 */
export const WORKSPACE_NAME = "agent-engineering-platform";

export const TARGET_NODE_MAJOR = 26;

export const CURSOR_SDK_MIN_NODE = "22.13.0";

export function getWorkspaceName(): string {
  return WORKSPACE_NAME;
}
