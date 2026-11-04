export type OutputMode = {
  readonly json: boolean;
};

export function writeSuccess(mode: OutputMode, payload: unknown, text: string): void {
  if (mode.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${text}\n`);
}

export function writeError(mode: OutputMode, code: string, message: string): void {
  if (mode.json) {
    process.stderr.write(`${JSON.stringify({ ok: false, code, message }, null, 2)}\n`);
    return;
  }
  process.stderr.write(`Error (${code}): ${message}\n`);
}
