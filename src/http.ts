#!/usr/bin/env node
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import dotenv from "dotenv";
import { createKronosServer, type KronosServerProfile } from "./server.js";
import { hasValidBearerToken } from "./http-auth.js";
import { FixedWindowRateLimiter } from "./http-rate-limit.js";
import { randomUUID } from "node:crypto";
import { log } from "./observability/log.js";

dotenv.config({
  path: process.env.DOTENV_CONFIG_PATH || ".env",
  quiet: true,
  debug: false,
  override: false,
});

type HttpDeploymentProfile = "authenticated" | "public-local";

function parseProfile(): HttpDeploymentProfile {
  const value = (process.env.MSP_HTTP_PROFILE || "authenticated").trim().toLowerCase().replace(/_/g, "-");
  if (value === "authenticated" || value === "full") return "authenticated";
  if (value === "public-local" || value === "public") return "public-local";
  throw new Error("MSP_HTTP_PROFILE must be 'authenticated' or 'public-local'.");
}

function parseBoundedInteger(
  name: string,
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function parseBoolean(name: string, raw: string | undefined, fallback = false): boolean {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  throw new Error(`${name} must be a boolean value.`);
}

const deploymentProfile = parseProfile();
const serverProfile: KronosServerProfile = deploymentProfile === "public-local" ? "public-local" : "full";
const isPublicLocal = deploymentProfile === "public-local";

const configuredToken = process.env.MSP_HTTP_BEARER_TOKEN?.trim();
if (!isPublicLocal && (!configuredToken || configuredToken.length < 32)) {
  throw new Error("MSP_HTTP_BEARER_TOKEN must be configured and contain at least 32 characters.");
}

const port = parseBoundedInteger(
  "PORT/MSP_HTTP_PORT",
  process.env.PORT || process.env.MSP_HTTP_PORT,
  3000,
  1,
  65535,
);
const host = process.env.MSP_HTTP_HOST || "0.0.0.0";
const maxBodyBytes = parseBoundedInteger(
  "MSP_HTTP_MAX_BODY_BYTES",
  process.env.MSP_HTTP_MAX_BODY_BYTES,
  2 * 1024 * 1024,
  1024,
  16 * 1024 * 1024,
);
const rateLimitPerMinute = parseBoundedInteger(
  "MSP_HTTP_RATE_LIMIT_PER_MINUTE",
  process.env.MSP_HTTP_RATE_LIMIT_PER_MINUTE,
  isPublicLocal ? 240 : 0,
  0,
  100_000,
);
const trustProxy = parseBoolean("MSP_HTTP_TRUST_PROXY", process.env.MSP_HTTP_TRUST_PROXY);
const rateLimiter = new FixedWindowRateLimiter(rateLimitPerMinute);

function sendJson(res: ServerResponse, status: number, payload: Record<string, string>): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(payload));
}

function rateLimitKey(req: IncomingMessage): string {
  if (trustProxy) {
    const forwarded = req.headers["x-forwarded-for"];
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const first = raw?.split(",", 1)[0]?.trim();
    if (first && first.length <= 128) return first;
  }
  return req.socket.remoteAddress || "unknown";
}

const activeRequests = new Set<() => Promise<void>>();

async function handleMcpRequest(req: IncomingMessage, res: ServerResponse, correlationId: string): Promise<void> {
  // The SDK's stateless Streamable HTTP transport is single-use: each HTTP
  // request needs its own transport and MCP server instance. Tool state in
  // the authenticated profile still lives in process-level stores, just as it
  // did when one server handled the process.
  const start = performance.now();
  log.info("mcp_request_start", { correlationId, method: req.method ?? "UNKNOWN" });
  const mcpServer = createKronosServer({ profile: serverProfile });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    maxRequestBodySize: maxBodyBytes,
  });

  let closed = false;
  const cleanup = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    activeRequests.delete(cleanup);
    await Promise.allSettled([transport.close(), mcpServer.close()]);
  };
  activeRequests.add(cleanup);
  res.once("close", () => void cleanup());

  try {
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("x-correlation-id", correlationId);
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res);
    const durationMs = Math.round(performance.now() - start);
    log.info("mcp_request_complete", { correlationId, durationMs, status: res.statusCode });
  } catch {
    const durationMs = Math.round(performance.now() - start);
    log.warn("mcp_request_error", { correlationId, durationMs });
    if (!res.headersSent) sendJson(res, 500, { error: "INTERNAL_ERROR", correlationId });
    else if (!res.writableEnded) res.destroy();
  } finally {
    if (res.writableEnded || res.destroyed) await cleanup();
  }
}

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const correlationId = (req.headers["x-correlation-id"] as string) || (req.headers["x-request-id"] as string) || randomUUID();
  let pathname: string;
  try {
    pathname = new URL(req.url || "/", "http://localhost").pathname;
  } catch {
    sendJson(res, 400, { error: "INVALID_REQUEST", correlationId });
    return;
  }

  if (pathname === "/healthz" && req.method === "GET") {
    sendJson(res, 200, { status: "ok", service: "kronos-msp", profile: deploymentProfile });
    return;
  }

  if (pathname === "/" && req.method === "GET") {
    sendJson(res, 200, {
      status: "ok",
      service: "kronos-msp",
      profile: deploymentProfile,
      mcpEndpoint: "/mcp",
      healthCheck: "/healthz",
    });
    return;
  }

  if (pathname !== "/mcp") {
    sendJson(res, 404, { error: "NOT_FOUND", correlationId });
    return;
  }

  const rate = rateLimiter.consume(rateLimitKey(req));
  if (!rate.allowed) {
    res.setHeader("retry-after", String(rate.retryAfterSeconds));
    sendJson(res, 429, { error: "RATE_LIMITED", correlationId });
    log.warn("rate_limited", { correlationId, retryAfterSeconds: rate.retryAfterSeconds });
    return;
  }

  const rawAuth = req.headers.authorization;
  const normalizedAuth = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
  if (!isPublicLocal && !hasValidBearerToken(normalizedAuth, configuredToken)) {
    res.setHeader("www-authenticate", "Bearer");
    sendJson(res, 401, { error: "AUTH_REQUIRED", correlationId });
    log.warn("auth_failed", { correlationId });
    return;
  }

  await handleMcpRequest(req, res, correlationId);
});

httpServer.on("error", (error: NodeJS.ErrnoException) => {
  process.stderr.write(`[kronos-msp-http] server error: ${error.code || "UNKNOWN"}\n`);
  process.exitCode = 1;
});

httpServer.listen(port, host, () => {
  process.stderr.write(
    `[kronos-msp-http] listening on ${host}:${port} profile=${deploymentProfile} ` +
      `maxBodyBytes=${maxBodyBytes} rateLimitPerMinute=${rateLimitPerMinute}\n`,
  );
  if (isPublicLocal) {
    process.stderr.write(
      "[kronos-msp-http] public-local profile: anonymous access is enabled for stateless local tools only. " +
        "MSP_HTTP_BEARER_TOKEN and KRONOS_MCP_TOKEN are not used by this profile.\n",
    );
  }
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stderr.write(`[kronos-msp-http] received ${signal}; shutting down\n`);
  httpServer.close();
  await Promise.allSettled([...activeRequests].map((close) => close()));
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
