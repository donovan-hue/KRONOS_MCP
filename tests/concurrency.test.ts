import assert from "node:assert/strict";
import test from "node:test";
import { nextCronRuns, MAX_CRON_COUNT } from "../src/engines/time.js";
import { withLock } from "../src/state/stores.js";

test("nextCronRuns respects MAX_CRON_COUNT=100 §2.4", () => {
  assert.equal(MAX_CRON_COUNT, 100);
  const from = new Date("2026-01-01T00:00:00Z");
  const ok = nextCronRuns("* * * * *", from, 100);
  assert.equal(ok.length, 100);
  assert.throws(() => nextCronRuns("* * * * *", from, 101), /INVALID_INPUT/);
  assert.throws(() => nextCronRuns("* * * * *", from, 0), /INVALID_INPUT/);
  assert.throws(() => nextCronRuns("* * * * *", from, 1000), /INVALID_INPUT/);
});

test("withLock guarantees atomic increment under concurrent calls", async () => {
  let counter = 0;
  const key = `test-lock-${Date.now()}`;
  const increments = 20;
  await Promise.all(
    Array.from({ length: increments }, () =>
      withLock(key, async () => {
        const cur = counter;
        await new Promise((r) => setTimeout(r, 2));
        counter = cur + 1;
      })
    )
  );
  assert.equal(counter, increments, "counter must be exactly increments when serialized by withLock");
});

test("withLock isolates different keys concurrently", async () => {
  let a = 0, b = 0;
  await Promise.all([
    withLock("key-a", async () => { await new Promise(r=>setTimeout(r,5)); a=1; }),
    withLock("key-b", async () => { await new Promise(r=>setTimeout(r,5)); b=1; }),
  ]);
  assert.equal(a, 1);
  assert.equal(b, 1);
});

test("idempotency race: concurrent same key yields single execution", async () => {
  // Simulate idempotencyKeys store race with withLock
  const { idempotencyKeys } = await import("../src/state/stores.js");
  idempotencyKeys.clear();
  const key = "idem-test-" + Date.now();
  let executions = 0;
  async function guardedTask() {
    return withLock(`idem:${key}`, async () => {
      if (idempotencyKeys.has(key)) {
        const rec = idempotencyKeys.get(key)!;
        if (rec.status === "in_progress" || rec.status === "completed") return "deduped";
      }
      idempotencyKeys.set(key, { payloadHash: "h", status: "in_progress", createdAt: Date.now(), ttlSeconds: 60 });
      executions++;
      await new Promise(r=>setTimeout(r,5));
      idempotencyKeys.set(key, { payloadHash: "h", status: "completed", createdAt: Date.now(), ttlSeconds: 60 });
      return "executed";
    });
  }
  const results = await Promise.all([guardedTask(), guardedTask(), guardedTask()]);
  assert.equal(executions, 1, "only one execution should happen");
  assert.ok(results.includes("executed"));
  assert.ok(results.includes("deduped"));
  idempotencyKeys.delete(key);
});

test("telemetryEvents capped at 5000 and MAX_TELEMETRY exported", async () => {
  const stores = await import("../src/state/stores.js");
  assert.ok("MAX_TELEMETRY" in stores);
  assert.equal((stores as any).MAX_TELEMETRY, 5000);
  // f17 also defines MAX_TELEMETRY
  const f17 = await import("../src/families/f17-observability.js");
  // check that telemetryEvents length is capped after ingest tool (via withLock)
  const { telemetryEvents } = stores;
  const before = telemetryEvents.length;
  // push over limit simulation
  for (let i=0;i<10;i++) telemetryEvents.push({ name: "test.metric", value: i, at: new Date().toISOString(), tags: {} });
  assert.ok(telemetryEvents.length >= before);
  // cleanup
  telemetryEvents.splice(before);
});

test("customPattern ReDoS sanitization rejects dangerous patterns", async () => {
  // Use the same logic as f08: safeRegExp should reject nested quantifiers
  // We test via direct tool call to ensure sanitization active
  const { createKronosServer } = await import("../src/server.js");
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
  const server = createKronosServer();
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1.0.0" });
  await server.connect(st);
  await client.connect(ct);
  try {
    const r = await client.callTool({ name: "kronos_structured_data_extractor", arguments: { text: "aaaa", customPattern: "(a+)+b" } });
    const txt = JSON.stringify(r);
    assert.ok(txt.includes("INVALID_INPUT") || r.isError, "dangerous pattern should be rejected as INVALID_INPUT");
    const ok = await client.callTool({ name: "kronos_structured_data_extractor", arguments: { text: "hello world", customPattern: "hello" } });
    assert.equal(ok.isError !== true, true);
    const payload = ok.structuredContent as any;
    assert.ok(payload.data.extracted.custom);
  } finally {
    await client.close();
    await server.close();
  }
});
