import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import dotenv from "dotenv";
import { createKronosServer } from "./server.js";

dotenv.config({
  path: process.env.DOTENV_CONFIG_PATH || ".env",
  quiet: true,
  debug: false,
  override: false,
});

const configuredToken = process.env.MSP_HTTP_BEARER_TOKEN?.trim();
if (!configuredToken || configuredToken.length < 32) {
  throw new Error("MSP_HTTP_BEARER_TOKEN must be configured and contain at least 32 characters.");
}

const portValue = process.env.PORT || process.env.MSP_HTTP_PORT || "3000";
const port = Number(portValue);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT/MSP_HTTP_PORT must be an integer between 1 and 65535.");
}

const host = process.env.MSP_HTTP_HOST || "0.0.0.0";
const expectedAuthorization = Buffer.from(`Bearer ${configuredToken}`);

export function hasValidBearerToken(authorization: string | undefined): boolean {
  if (!authorization) return false;
  const provided = Buffer.from(authorization);
  return provided.length === expectedAuthorization.length &&
    timingSafeEqual(provided, expectedAuthorization);
}

function sendJson(res: ServerResponse, status: number, payload: Record<string, string>): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(payload));
}

const mcpServer = createKronosServer();
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
});
await mcpServer.connect(transport);

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const pathname = new URL(req.url || "/", "http://localhost").pathname;

  if (pathname === "/healthz" && req.method === "GET") {
    sendJson(res, 200, { status: "ok", service: "kronos-msp" });
    return;
  }

  if (pathname !== "/mcp") {
    sendJson(res, 404, { error: "NOT_FOUND" });
    return;
  }

  if (!hasValidBearerToken(req.headers.authorization)) {
    res.setHeader("www-authenticate", "Bearer");
    sendJson(res, 401, { error: "AUTH_REQUIRED" });
    return;
  }

  try {
    await transport.handleRequest(req, res);
  } catch {
    if (!res.headersSent) sendJson(res, 500, { error: "INTERNAL_ERROR" });
    else res.destroy();
  }
});

httpServer.on("error", (error: NodeJS.ErrnoException) => {
  process.stderr.write(`[kronos-msp-http] server error: ${error.code || "UNKNOWN"}\n`);
  process.exitCode = 1;
});

httpServer.listen(port, host, () => {
  process.stderr.write(`[kronos-msp-http] listening on ${host}:${port}\n`);
});

async function shutdown(signal: string): Promise<void> {
  process.stderr.write(`[kronos-msp-http] received ${signal}; shutting down\n`);
  httpServer.close(() => {
    void transport.close().finally(() => {
      process.exit(0);
    });
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
