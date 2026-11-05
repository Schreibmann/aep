/**
 * Public surface for the Cursor runtime package.
 * `@cursor/sdk` is imported only from live-sdk-bridge (and validation scripts).
 */
export const CURSOR_RUNTIME_ID = "cursor";

export const CURSOR_SDK_PACKAGE = "@cursor/sdk";

export const CURSOR_SDK_PINNED_VERSION = "1.3.1";

export const CURSOR_SDK_MIN_NODE = "22.13.0";

export type { CursorAgentRuntimeOptions } from "./cursor-agent-runtime.js";
export { CursorAgentRuntime } from "./cursor-agent-runtime.js";
export {
  BoundedEventBuffer,
  normalizeSdkStreamEvent,
  parseUnknownSdkMessage,
} from "./normalize.js";
export type { CursorSdkBridge } from "./sdk-bridge.js";
export type { StubSdkBridgeOptions } from "./stub-sdk-bridge.js";
export { StubCursorSdkBridge } from "./stub-sdk-bridge.js";
