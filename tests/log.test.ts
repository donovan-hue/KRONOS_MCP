import test from "node:test";
import assert from "node:assert/strict";
import {
  currentLevel,
  isLevelEnabled,
  log,
  logEvent,
  sanitizeFields,
} from "../src/observability/log.js";

/**
 * Captures everything written to stderr while `fn` runs, and asserts that
 * nothing reached stdout. stdout belongs to MCP, so a single stray byte there
 * is a protocol failure rather than a cosmetic problem.
 */
function captureStderr(fn: () => void): string {
  const stderrChunks: string[] = [];
  const stdoutChunks: string[] = [];
  const originalStderr = process.stderr.write.bind(process.stderr);
  const originalStdout = process.stdout.write.bind(process.stdout);

  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderrChunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdoutChunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;

  try {
    fn();
  } finally {
    process.stderr.write = originalStderr;
    process.stdout.write = originalStdout;
  }

  assert.deepEqual(stdoutChunks, [], "logging must never write to stdout");
  return stderrChunks.join("");
}

test("sanitizeFields keeps primitives and omits everything else", () => {
  assert.deepEqual(sanitizeFields({ a: "x", b: 1, c: true, d: null }), {
    a: "x",
    b: 1,
    c: true,
    d: null,
  });

  assert.deepEqual(
    sanitizeFields({
      token: { value: "secret" },
      headers: ["authorization"],
      fn: () => 1,
      ok: "yes",
    }),
    { token: "[omitted]", headers: "[omitted]", fn: "[omitted]", ok: "yes" },
  );

  assert.deepEqual(sanitizeFields(), {});
});

test("a logged object can never carry a secret", () => {
  const result = sanitizeFields({ nested: { apiKey: "sk-or-v1-secret" } });
  assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.equal(result.nested, "[omitted]");
});

test("logEvent writes a single JSON line to stderr only", () => {
  const output = captureStderr(() => {
    logEvent("warn", "unit_event", { code: "FORBIDDEN", httpStatus: 403 });
  });

  const lines = output.trim().split("\n");
  assert.equal(lines.length, 1);

  const parsed = JSON.parse(lines[0]!);
  assert.equal(parsed.level, "warn");
  assert.equal(parsed.event, "unit_event");
  assert.equal(parsed.code, "FORBIDDEN");
  assert.equal(parsed.httpStatus, 403);
  assert.ok(typeof parsed.ts === "string" && parsed.ts.length > 0);
});

test("level threshold is read from the environment and honoured", (t) => {
  const previous = process.env.KRONOS_LOG_LEVEL;
  t.after(() => {
    if (previous === undefined) delete process.env.KRONOS_LOG_LEVEL;
    else process.env.KRONOS_LOG_LEVEL = previous;
  });

  process.env.KRONOS_LOG_LEVEL = "warn";
  assert.equal(currentLevel(), "warn");
  assert.equal(isLevelEnabled("debug"), false);
  assert.equal(isLevelEnabled("error"), true);

  assert.equal(captureStderr(() => log.debug("suppressed")), "");
  assert.match(captureStderr(() => log.error("emitted")), /emitted/);

  process.env.KRONOS_LOG_LEVEL = "not-a-level";
  assert.equal(currentLevel(), "info", "an invalid level falls back to info");
});

test("default level is info, so warn and error are always emitted", () => {
  const previous = process.env.KRONOS_LOG_LEVEL;
  delete process.env.KRONOS_LOG_LEVEL;
  try {
    assert.equal(currentLevel(), "info");
    assert.equal(isLevelEnabled("warn"), true);
    assert.equal(isLevelEnabled("debug"), false);
  } finally {
    if (previous !== undefined) process.env.KRONOS_LOG_LEVEL = previous;
  }
});

test("the convenience helpers map to their levels", () => {
  const output = captureStderr(() => {
    log.info("an_info");
    log.warn("a_warn");
    log.error("an_error");
  });

  assert.match(output, /"level":"info"/);
  assert.match(output, /"level":"warn"/);
  assert.match(output, /"level":"error"/);
  assert.equal(output.trim().split("\n").length, 3);
});
