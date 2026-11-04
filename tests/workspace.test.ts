import { describe, expect, it } from "vitest";
import {
  CURSOR_SDK_MIN_NODE,
  getWorkspaceName,
  TARGET_NODE_MAJOR,
  WORKSPACE_NAME,
} from "../src/workspace.js";

describe("workspace bootstrap", () => {
  it("exposes the repository codename", () => {
    expect(getWorkspaceName()).toBe("agent-engineering-platform");
    expect(WORKSPACE_NAME).toBe("agent-engineering-platform");
  });

  it("documents Node targets from the architecture", () => {
    expect(TARGET_NODE_MAJOR).toBe(26);
    expect(CURSOR_SDK_MIN_NODE).toBe("22.13.0");
  });
});
