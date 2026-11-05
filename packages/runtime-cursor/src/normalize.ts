import type { AgentEvent } from "@aep/runtime-contracts";
import type { SdkStreamEvent } from "./sdk-bridge.js";

export type NormalizeContext = {
  readonly executionId: string;
  readonly agentId: string;
  readonly runId: string;
};

/**
 * Normalize opaque SDK stream messages into AEP AgentEvents.
 * tool_call args/results are never inspected beyond name/status strings.
 * Thinking / private transcript content is dropped (not persisted).
 */
export function normalizeSdkStreamEvent(
  ctx: NormalizeContext,
  event: SdkStreamEvent,
): AgentEvent | undefined {
  switch (event.type) {
    case "assistant":
      if (event.text.trim().length === 0) {
        return undefined;
      }
      return {
        type: "assistant_text",
        executionId: ctx.executionId,
        text: event.text,
      };
    case "tool_call":
      return {
        type: "tool_activity",
        executionId: ctx.executionId,
        toolName: event.name,
        status: event.status,
      };
    case "status":
      return {
        type: "status",
        executionId: ctx.executionId,
        status: event.status,
      };
    case "thinking":
      // Do not persist hidden reasoning / private transcript.
      return undefined;
    case "unknown":
      return {
        type: "status",
        executionId: ctx.executionId,
        status: `unknown_event:${event.rawType}`,
      };
    default: {
      const _exhaustive: never = event;
      void _exhaustive;
      return undefined;
    }
  }
}

/**
 * Defensively parse an unknown SDK envelope into SdkStreamEvent without throwing.
 */
export function parseUnknownSdkMessage(message: unknown): SdkStreamEvent {
  if (typeof message !== "object" || message === null) {
    return { type: "unknown", rawType: "non_object" };
  }
  if (!("type" in message) || typeof message.type !== "string") {
    return { type: "unknown", rawType: "missing_type" };
  }
  const type = message.type;
  if (type === "assistant") {
    const text = extractAssistantText(message);
    return { type: "assistant", text };
  }
  if (type === "tool_call") {
    const name = "name" in message && typeof message.name === "string" ? message.name : "unknown";
    // args/result intentionally ignored (unstable unknown)
    const status =
      "status" in message && typeof message.status === "string" ? message.status : "unknown";
    return { type: "tool_call", name, status };
  }
  if (type === "status") {
    const status =
      "status" in message && typeof message.status === "string" ? message.status : "unknown";
    return { type: "status", status };
  }
  if (type === "thinking" || type === "reasoning") {
    return { type: "thinking", text: "" };
  }
  if (type === "usage") {
    return { type: "status", status: "usage" };
  }
  return { type: "unknown", rawType: type };
}

function extractAssistantText(message: object): string {
  if (!("message" in message) || typeof message.message !== "object" || message.message === null) {
    if ("text" in message && typeof message.text === "string") {
      return message.text;
    }
    return "";
  }
  const payload = message.message;
  if (!("content" in payload) || !Array.isArray(payload.content)) {
    return "";
  }
  const parts: string[] = [];
  for (const block of payload.content) {
    if (
      typeof block === "object" &&
      block !== null &&
      "type" in block &&
      block.type === "text" &&
      "text" in block &&
      typeof block.text === "string"
    ) {
      parts.push(block.text);
    }
  }
  return parts.join("");
}

/**
 * Bounded in-memory event buffer (keeps stream order; drops oldest when full).
 */
export class BoundedEventBuffer {
  private readonly items: AgentEvent[] = [];
  private dropped = 0;

  constructor(private readonly maxEvents: number) {
    if (!Number.isInteger(maxEvents) || maxEvents < 1) {
      throw new Error("maxEvents must be a positive integer");
    }
  }

  push(event: AgentEvent): void {
    if (this.items.length >= this.maxEvents) {
      this.items.shift();
      this.dropped += 1;
    }
    this.items.push(event);
  }

  snapshot(): ReadonlyArray<AgentEvent> {
    return [...this.items];
  }

  get droppedCount(): number {
    return this.dropped;
  }
}
