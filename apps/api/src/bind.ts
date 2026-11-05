import { LocalApiError } from "./errors.ts";

export type BindOptions = {
  readonly host: string;
  readonly port: number;
  /** Explicit opt-in required before binding outside loopback. */
  readonly allowLan: boolean;
};

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function assertSafeBindHost(options: BindOptions): void {
  const host = options.host.trim().toLowerCase();
  if (host.length === 0) {
    throw new LocalApiError("invalid_host", "host must be non-empty", 500);
  }
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
    throw new LocalApiError("invalid_port", "port must be 0..65535 (0 = ephemeral)", 500);
  }
  const isLoopback = LOOPBACK_HOSTS.has(host);
  if (!isLoopback && !options.allowLan) {
    throw new LocalApiError(
      "lan_bind_denied",
      "Refusing non-loopback bind without allowLan=true (and authentication)",
      500,
    );
  }
  if (!isLoopback && options.allowLan) {
    // LAN opt-in still requires callers to supply auth; enforced at server create.
  }
}

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.trim().toLowerCase());
}
