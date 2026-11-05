import { createApp } from "@aep/application";
import { createLocalApiAuth, createLocalApiServer, generateLocalApiToken } from "./index.ts";

function readArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx < 0) {
    return undefined;
  }
  return process.argv[idx + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function main(): Promise<void> {
  const host = readArg("--host") ?? process.env.AEP_API_HOST ?? "127.0.0.1";
  const portRaw = readArg("--port") ?? process.env.AEP_API_PORT ?? "7432";
  const port = Number(portRaw);
  const allowLan = hasFlag("--allow-lan") || process.env.AEP_API_ALLOW_LAN === "1";
  const token = process.env.AEP_API_TOKEN?.trim() || generateLocalApiToken();
  const generated = process.env.AEP_API_TOKEN === undefined;

  const app = createApp();
  const server = createLocalApiServer({
    app,
    auth: createLocalApiAuth(token),
    host,
    port,
    allowLan,
  });
  const bound = await server.listen();
  const lines = [
    `AEP local API listening on http://${bound.host}:${bound.port}`,
    "Auth: Bearer token required (except GET /health on loopback).",
  ];
  if (generated) {
    lines.push(`Generated AEP_API_TOKEN (set env to reuse): ${token}`);
  } else {
    lines.push("Using AEP_API_TOKEN from environment (value not printed).");
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`aep-api failed: ${message}\n`);
  process.exitCode = 1;
});
