import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { LocalApiError } from "./errors.js";

export type LocalApiAuth = {
  readonly tokenHash: string;
};

export function generateLocalApiToken(): string {
  return `aep_${randomBytes(24).toString("base64url")}`;
}

export function hashLocalApiToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createLocalApiAuth(token: string): LocalApiAuth {
  const trimmed = token.trim();
  if (trimmed.length < 16) {
    throw new LocalApiError("weak_token", "API token must be at least 16 characters", 500);
  }
  return { tokenHash: hashLocalApiToken(trimmed) };
}

function extractBearer(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  if (typeof header !== "string") {
    return undefined;
  }
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match === null) {
    return undefined;
  }
  const token = (match[1] ?? "").trim();
  return token.length === 0 ? undefined : token;
}

export function assertAuthorized(req: IncomingMessage, auth: LocalApiAuth): void {
  const token = extractBearer(req);
  if (token === undefined) {
    throw new LocalApiError("unauthorized", "Missing Bearer token", 401);
  }
  const provided = Buffer.from(hashLocalApiToken(token), "utf8");
  const expected = Buffer.from(auth.tokenHash, "utf8");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new LocalApiError("unauthorized", "Invalid Bearer token", 401);
  }
}
