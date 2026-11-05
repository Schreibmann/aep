export class ProjectProfilesError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProjectProfilesError";
    this.code = code;
  }
}
