import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { catalogEntry } from "../src/catalog/index.js";
import { ALL_LOCAL_TOOLS } from "../src/families/index.js";
import { FixedWindowRateLimiter } from "../src/http-rate-limit.js";
import { createKronosServer } from "../src/server.js";
import {
  isPublicLocalTool,
  localToolsForProfile,
  PUBLIC_LOCAL_EXCLUDED_TOOL_NUMBERS,
} from "../src/tools/register-local-tools.js";

const originalFetch = globalThis.fetch;
test.before(() => {
  globalThis.fetch = async () => { throw new Error("Offline suite: network disabled"); };
});
test.after(() => {
  globalThis.fetch = originalFetch;
});

test("public-local selecciona solo herramientas locales sin estado y sin amplificación/env", () => {
  const publicTools = localToolsForProfile("public-local");
  const stateful = ALL_LOCAL_TOOLS.filter((definition) => definition.stateful === true);

  assert.equal(stateful.length, 15);
  assert.deepEqual([...PUBLIC_LOCAL_EXCLUDED_TOOL_NUMBERS].sort((a, b) => a - b), [42, 153]);
  assert.equal(publicTools.length, 163);
  assert.ok(publicTools.every((definition) => isPublicLocalTool(definition)));
  assert.ok(publicTools.every((definition) => definition.stateful !== true));
  assert.ok(!publicTools.some((definition) => definition.number === 42));
  assert.ok(!publicTools.some((definition) => definition.number === 153));
});

test("public-local MCP no anuncia núcleo conectado, contratos ni herramientas excluidas", async (t) => {
  const server = createKronosServer({ profile: "public-local" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "deployment-profile-test", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(async () => { await client.close(); await server.close(); });

  const { tools } = await client.listTools();
  const names = new Set(tools.map((tool) => tool.name));

  assert.equal(tools.length, 163);
  for (const core of ["kronos_status", "kronos_health", "kronos_me", "kronos_contracts"]) {
    assert.equal(names.has(core), false, `${core} no debe exponerse en public-local`);
  }
  for (const definition of ALL_LOCAL_TOOLS.filter((item) => item.stateful === true)) {
    assert.equal(names.has(catalogEntry(definition.number).name), false);
  }
  assert.equal(names.has(catalogEntry(42).name), false);
  assert.equal(names.has(catalogEntry(153).name), false);
  for (const number of [6, 73, 116]) {
    assert.equal(names.has(catalogEntry(number).name), true);
  }
  assert.ok(tools.every((tool) => tool.annotations?.readOnlyHint === true));
  assert.ok(tools.every((tool) => tool.annotations?.openWorldHint === false));

  const selector = await client.callTool({
    name: catalogEntry(9).name,
    arguments: { familyId: "07" },
  });
  assert.notEqual(selector.isError, true);
  const payload = selector.structuredContent as {
    data: { tools: { number: number }[] };
  };
  const selectedNumbers = payload.data.tools.map((tool) => tool.number);
  assert.ok(!selectedNumbers.includes(61));
  assert.ok(!selectedNumbers.includes(62));
  assert.ok(selectedNumbers.includes(63));
});

test("limitador fixed-window deniega al superar el cupo y se reinicia por ventana", () => {
  const limiter = new FixedWindowRateLimiter(2, 60_000);
  const now = 1_000_000;

  assert.equal(limiter.consume("client-a", now).allowed, true);
  assert.equal(limiter.consume("client-a", now + 1).allowed, true);
  const denied = limiter.consume("client-a", now + 2);
  assert.equal(denied.allowed, false);
  assert.ok(denied.retryAfterSeconds >= 1);
  assert.equal(limiter.consume("client-b", now + 2).allowed, true);
  assert.equal(limiter.consume("client-a", now + 60_000).allowed, true);

  const disabled = new FixedWindowRateLimiter(0);
  assert.equal(disabled.consume("client-a", now).allowed, true);
});
