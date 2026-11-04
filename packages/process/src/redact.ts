/**
 * Deterministic secret redaction for command output.
 */
export function redactText(input: string, secrets: ReadonlyArray<string>): string {
  let result = input;
  for (const secret of secrets) {
    if (secret.length === 0) {
      continue;
    }
    result = result.split(secret).join("[REDACTED]");
  }
  return result;
}

export function truncateUtf8(
  input: string,
  maxBytes: number,
): { readonly text: string; readonly truncated: boolean } {
  if (maxBytes < 0) {
    return { text: "", truncated: input.length > 0 };
  }
  const buffer = Buffer.from(input, "utf8");
  if (buffer.byteLength <= maxBytes) {
    return { text: input, truncated: false };
  }
  return {
    text: buffer.subarray(0, maxBytes).toString("utf8"),
    truncated: true,
  };
}
