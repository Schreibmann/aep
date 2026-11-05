import { SecurityError } from "./errors.ts";

export type SecureCredentialSource = {
  /** Returns API key material for SDK options only — never logged. */
  getCursorApiKey(): string | undefined;
};

/**
 * In-memory credential source for tests / DI. Production wires OS secret store later.
 */
export class MemoryCredentialSource implements SecureCredentialSource {
  private readonly cursorApiKey: string | undefined;

  constructor(cursorApiKey: string | undefined) {
    this.cursorApiKey = cursorApiKey;
  }

  getCursorApiKey(): string | undefined {
    return this.cursorApiKey;
  }
}

/**
 * Resolve Cursor API key for SDK constructor options.
 * MUST NOT write the key into prompts, worktrees, or process env allowlists for agents.
 */
export function resolveCursorApiKeyForSdk(source: SecureCredentialSource): string {
  const key = source.getCursorApiKey()?.trim();
  if (key === undefined || key.length === 0) {
    throw new SecurityError(
      "missing_cursor_api_key",
      "Cursor API key is not available from the secure credential source",
    );
  }
  return key;
}

export function assertNoSecretInText(text: string, secrets: ReadonlyArray<string>): void {
  for (const secret of secrets) {
    if (secret.length > 0 && text.includes(secret)) {
      throw new SecurityError(
        "secret_leak",
        "Secret material must not appear in prompts, logs, or agent-visible text",
      );
    }
  }
}
