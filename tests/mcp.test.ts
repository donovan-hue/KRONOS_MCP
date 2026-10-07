import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { KronosApiError, getKronosHealth } from "../src/services/kronos-api.js";
import { getKronosMe } from "../src/services/kronos-auth.js";
import { createKronosServer } from "../src/server.js";

// Test process only: never use inherited real credentials or network access.
const originalToken = process.env.KRONOS_MCP_TOKEN;
const originalFetch = globalThis.fetch;
test.before(() => {
  delete process.env.KRONOS_MCP_TOKEN;
  globalThis.fetch = async () => { throw new Error("Offline suite: network disabled"); };
});
test.after(() => {
  if (originalToken === undefined) delete process.env.KRONOS_MCP_TOKEN;
  else process.env.KRONOS_MCP_TOKEN = originalToken;
  globalThis.fetch = originalFetch;
});

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

const health = {
  ok: true, service: "kronos-space", database: "connected", realtime: true,
  timestamp: "2026-10-04T00:00:00.000Z", environment: "production",
  build: { commit: null, commitShort: null, branch: "main", repo: null, serviceName: "api", startedAt: "2026-10-04T00:00:00.000Z", traceable: false },
  environmentDeclared: true, autoIndex: false,
};

test("config accepts HTTPS and rejects malformed, credentialed, or insecure URLs", async () => {
  const { getKronosConfig } = await import("../src/config/env.js");
  const previous = process.env.KRONOS_API_URL;
  try {
    process.env.KRONOS_API_URL = "https://kronos.example/api/";
    assert.equal(getKronosConfig().KRONOS_API_URL, "https://kronos.example/api");
    for (const value of ["http://kronos.example", "not a URL", "https://user:pass@kronos.example", "https://kronos.example?token=x"]) {
      process.env.KRONOS_API_URL = value;
      assert.throws(() => getKronosConfig(), /CONFIG_INVALID/);
    }
  } finally {
    if (previous === undefined) delete process.env.KRONOS_API_URL;
    else process.env.KRONOS_API_URL = previous;
  }
});

test("health contract is validated and makes an unauthenticated GET", async () => {
  let called = false;
  const result = await getKronosHealth({ baseUrl: "https://unit.invalid", fetchImpl: async (input, init) => {
    called = true;
    assert.equal(String(input), "https://unit.invalid/api/health");
    assert.equal(new Headers(init?.headers).has("authorization"), false);
    assert.equal(init?.redirect, "error");
    return jsonResponse(health);
  } });
  assert.equal(called, true);
  assert.equal(result.database, "connected");
});

test("health rejects a malformed successful payload", async () => {
  await assert.rejects(getKronosHealth({ baseUrl: "https://unit.invalid", fetchImpl: async () => jsonResponse({ ok: "yes" }) }),
    (error: unknown) => error instanceof KronosApiError && error.code === "INVALID_RESPONSE");
});

test("HTTP status is retained without forwarding upstream response body", async () => {
  await assert.rejects(getKronosHealth({ baseUrl: "https://unit.invalid", fetchImpl: async () => jsonResponse({ error: "private backend detail" }, { status: 503 }) }),
    (error: unknown) => error instanceof KronosApiError && error.code === "UPSTREAM_HTTP_ERROR" && error.httpStatus === 503 && !error.message.includes("private"));
});

test("non-JSON, redirects and transport failures are classified safely", async (t) => {
  await t.test("HTML response", async () => assert.rejects(getKronosHealth({ baseUrl: "https://unit.invalid", fetchImpl: async () => new Response("secret", { headers: { "content-type": "text/html" } }) }),
    (e: unknown) => e instanceof KronosApiError && e.code === "INVALID_RESPONSE"));
  await t.test("timeout", async () => assert.rejects(getKronosHealth({ baseUrl: "https://unit.invalid", fetchImpl: async () => { throw new DOMException("private", "TimeoutError"); } }),
    (e: unknown) => e instanceof KronosApiError && e.code === "UPSTREAM_TIMEOUT"));
  await t.test("network", async () => assert.rejects(getKronosHealth({ baseUrl: "https://unit.invalid", fetchImpl: async () => { throw new Error("private network detail"); } }),
    (e: unknown) => e instanceof KronosApiError && e.code === "UPSTREAM_UNAVAILABLE" && !e.message.includes("private")));
});

test("oversized body is rejected", async () => {
  const payload = JSON.stringify(health) + " ".repeat(1_050_000);
  await assert.rejects(getKronosHealth({ baseUrl: "https://unit.invalid", fetchImpl: async () => new Response(payload, { headers: { "content-type": "application/json" } }) }),
    (e: unknown) => e instanceof KronosApiError && e.code === "RESPONSE_TOO_LARGE");
});

test("identity requires service token and sends it only to configured KRONOS endpoint", async () => {
  await assert.rejects(getKronosMe({ baseUrl: "https://unit.invalid", fetchImpl: async () => { throw new Error("must not call"); } }),
    (e: unknown) => e instanceof KronosApiError && e.code === "AUTH_REQUIRED");
  let seenAuth: string | null = null;
  const identity = await getKronosMe({ baseUrl: "https://unit.invalid", token: "test-only-token", fetchImpl: async (input, init) => {
    assert.equal(String(input), "https://unit.invalid/api/mcp/me");
    seenAuth = new Headers(init?.headers).get("authorization");
    return jsonResponse({ ok: true, service: "kronos-mcp", identity: "unit-agent", permissions: ["read"] });
  } });
  assert.equal(seenAuth, "Bearer test-only-token");
  assert.equal(identity.identity, "unit-agent");
});

test("MCP advertises existing tools, structured output, and rejects extra input", async (t) => {
  const server = createKronosServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "unit-test", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(async () => { await client.close(); await server.close(); });

  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [
    "kronos_contracts",
    "kronos_health",
    "kronos_me",
    "kronos_status",
  ]);
  assert.ok(tools.every((tool) => tool.outputSchema));
  assert.ok(tools.every((tool) => tool.annotations?.readOnlyHint === true));
  const badInput = await client.callTool({ name: "kronos_status", arguments: { unexpected: true } });
  assert.equal(badInput.isError, true);
  assert.match(JSON.stringify(badInput), /Input validation error/);
  const missingToken = await client.callTool({ name: "kronos_me", arguments: {} });
  assert.equal(missingToken.isError, true);
  assert.match(JSON.stringify(missingToken), /AUTH_REQUIRED/);
});

test("kronos_contracts reports registered tools without network or credential", async (t) => {
  const server = createKronosServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "unit-test", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(async () => { await client.close(); await server.close(); });

  const result = await client.callTool({ name: "kronos_contracts", arguments: {} });
  assert.notEqual(result.isError, true);

  const payload = result.structuredContent as {
    service: string;
    capabilities: string[];
    tools: { name: string; capability: string; readOnly: boolean; requiredPermission?: string }[];
    resources: string[];
    prompts: string[];
  };

  assert.equal(payload.service, "kronos-mcp");
  assert.deepEqual(payload.capabilities, ["diagnostics"]);
  assert.deepEqual(payload.tools.map((tool) => tool.name).sort(), [
    "kronos_contracts",
    "kronos_health",
    "kronos_me",
    "kronos_status",
  ]);
  assert.ok(payload.tools.every((tool) => tool.readOnly === true));
  assert.ok(payload.tools.every((tool) => tool.requiredPermission === undefined));

  // Nothing is served yet, so nothing may be advertised.
  assert.deepEqual(payload.resources, []);
  assert.deepEqual(payload.prompts, []);

  const extraInput = await client.callTool({ name: "kronos_contracts", arguments: { x: 1 } });
  assert.equal(extraInput.isError, true);
});
