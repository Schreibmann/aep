export class GitWorkspacesError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GitWorkspacesError";
    this.code = code;
  }
}
