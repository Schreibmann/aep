/**
 * Normalized agent stream events (architecture §7.4).
 * tool_call payloads stay opaque — never drive workflow on their shape.
 */
export type AgentEvent =
  | {
      readonly type: "started";
      readonly executionId: string;
      readonly agentId: string;
      readonly runId: string;
    }
  | {
      readonly type: "assistant_text";
      readonly executionId: string;
      readonly text: string;
    }
  | {
      readonly type: "tool_activity";
      readonly executionId: string;
      readonly toolName: string;
      readonly status: string;
    }
  | {
      readonly type: "usage";
      readonly executionId: string;
      readonly inputTokens: number;
      readonly outputTokens: number;
      readonly cacheReadTokens: number;
      readonly cacheWriteTokens: number;
    }
  | {
      readonly type: "status";
      readonly executionId: string;
      readonly status: string;
    }
  | {
      readonly type: "completed";
      readonly executionId: string;
      readonly resultText?: string;
    }
  | {
      readonly type: "failed";
      readonly executionId: string;
      readonly code?: string;
      readonly safeMessage: string;
    }
  | {
      readonly type: "cancelled";
      readonly executionId: string;
    };
