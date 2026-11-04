import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CURSOR_RUNTIME_ID,
  CURSOR_SDK_MIN_NODE,
  CURSOR_SDK_PACKAGE,
  CURSOR_SDK_PINNED_VERSION,
} from "../src/index.js";

const require = createRequire(import.meta.url);
const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("@aep/runtime-cursor pin", () => {
  it("exposes cursor runtime identity", () => {
    expect(CURSOR_RUNTIME_ID).toBe("cursor");
    expect(CURSOR_SDK_PACKAGE).toBe("@cursor/sdk");
    expect(CURSOR_SDK_PINNED_VERSION).toBe("1.3.1");
    expect(CURSOR_SDK_MIN_NODE).toBe("22.13.0");
  });

  it("resolves the pinned SDK package version", () => {
    const sdkPkg: unknown = require(join(pkgRoot, "node_modules", "@cursor/sdk", "package.json"));
    expect(sdkPkg).toBeTypeOf("object");
    expect(sdkPkg).not.toBeNull();
    if (typeof sdkPkg !== "object" || sdkPkg === null) {
      throw new Error("SDK package.json did not resolve to an object");
    }
    expect("version" in sdkPkg).toBe(true);
    if (!("version" in sdkPkg)) {
      throw new Error("SDK package.json missing version");
    }
    expect(sdkPkg.version).toBe(CURSOR_SDK_PINNED_VERSION);
  });

  it("imports public Cursor SDK namespaces", async () => {
    const sdk = await import("@cursor/sdk");
    expect(["function", "object"]).toContain(typeof sdk.Agent);
    expect(["function", "object"]).toContain(typeof sdk.Cursor);
    expect(sdk.Agent.create).toBeTypeOf("function");
    expect(sdk.Cursor.models.list).toBeTypeOf("function");
  });
});
