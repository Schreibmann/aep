import { createServer, type Server } from "node:http";
import type { AepApplication } from "@aep/application";
import { assertAuthorized, type LocalApiAuth } from "./auth.js";
import { assertSafeBindHost, isLoopbackHost } from "./bind.js";
import { LocalApiError } from "./errors.js";
import { handleApiRequest } from "./router.js";

export type LocalApiServerOptions = {
  readonly app: AepApplication;
  readonly auth: LocalApiAuth;
  readonly host?: string;
  readonly port?: number;
  /** Explicit opt-in for non-loopback bind. Auth remains mandatory. */
  readonly allowLan?: boolean;
};

export type LocalApiServer = {
  readonly server: Server;
  readonly host: string;
  readonly port: number;
  listen(): Promise<{ host: string; port: number }>;
  close(): Promise<void>;
};

function sendJson(res: import("node:http").ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(payload);
}

/**
 * Authenticated local API. Defaults to 127.0.0.1; LAN bind requires allowLan.
 */
export function createLocalApiServer(options: LocalApiServerOptions): LocalApiServer {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 7432;
  const allowLan = options.allowLan === true;
  assertSafeBindHost({ host, port, allowLan });
  if (!isLoopbackHost(host) && allowLan === false) {
    throw new LocalApiError("lan_bind_denied", "LAN bind requires allowLan", 500);
  }

  const server = createServer((req, res) => {
    void (async () => {
      try {
        const url = req.url ?? "/";
        // Health can be unauthenticated for local process probes only on loopback listeners.
        const isHealth = (req.method ?? "GET").toUpperCase() === "GET" && url.startsWith("/health");
        if (!isHealth) {
          assertAuthorized(req, options.auth);
        } else if (!isLoopbackHost(host)) {
          assertAuthorized(req, options.auth);
        }
        const result = await handleApiRequest(options.app, req, url);
        sendJson(res, result.status, result.body);
      } catch (error) {
        if (error instanceof LocalApiError) {
          sendJson(res, error.status, { error: { code: error.code, message: error.message } });
          return;
        }
        sendJson(res, 500, {
          error: { code: "internal_error", message: "Internal server error" },
        });
      }
    })();
  });

  return {
    server,
    host,
    port,
    async listen() {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve();
        });
      });
      const address = server.address();
      const boundPort = address !== null && typeof address !== "string" ? address.port : port;
      return { host, port: boundPort };
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}
