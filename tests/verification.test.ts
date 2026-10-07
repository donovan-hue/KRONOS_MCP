import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { verifyMcp } from "../scripts/verify-mcp.mjs";

const exec = promisify(execFile);
const root = process.cwd();
const preload = pathToFileURL(resolve(root, 'tests/fixtures/kronos-fetch.mjs')).href;

for (const [scenario, expectedFailure] of [
  ['success', null],
  ['401', 'FAIL kronos_me UPSTREAM_HTTP_ERROR HTTP_401'],
  ['403', 'FAIL kronos_me UPSTREAM_HTTP_ERROR HTTP_403'],
  ['429', 'FAIL kronos_me UPSTREAM_HTTP_ERROR HTTP_429'],
  ['network', 'FAIL kronos_me UPSTREAM_UNAVAILABLE'],
  ['invalid-json', 'FAIL kronos_me INVALID_RESPONSE'],
  ['invalid-schema', 'FAIL kronos_me INVALID_RESPONSE'],
  ['ok-false', 'FAIL kronos_me INVALID_OUTPUT'],
  ['health-503', 'FAIL kronos_status UPSTREAM_HTTP_ERROR HTTP_503'],
] as const) {
  test(`verifier over actual stdio: ${scenario} (offline fetch fixture)`, { timeout: 10_000 }, async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'kronos-test-'));
    try {
      // The server really loads dotenv; never reads the developer's private file.
      await writeFile(join(cwd, '.env'), 'KRONOS_MCP_TOKEN=offline-token-not-a-credential\nKRONOS_API_URL=https://offline.invalid\n', { mode: 0o600 });
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: ['--import', preload, resolve(root, 'dist/index.js')],
        cwd,
        env: { TEST_SCENARIO: scenario },
        stderr: 'pipe',
      });
      let stderr = '';
      transport.stderr?.on('data', chunk => { stderr += String(chunk); });
      const lines: string[] = [];
      const passed = await verifyMcp(transport, (line: string) => lines.push(line));
      assert.equal(passed, !expectedFailure);
      if (expectedFailure) {
        assert.ok(lines.includes(expectedFailure));
        assert.ok(!lines.includes('PASS MCP_VERIFICATION_COMPLETE'));
      } else {
        assert.deepEqual(lines, [
          'PASS stdio_handshake_ping', 'PASS tools_list', 'PASS invalid_input_rejected',
          'PASS unknown_tool_rejected', 'PASS kronos_me', 'PASS kronos_status',
          'PASS kronos_health', 'PASS MCP_VERIFICATION_COMPLETE',
        ]);
      }
      const output = [...lines, stderr].join('\n');
      assert.ok(!output.includes('offline-private-detail'));
      assert.ok(!output.includes('offline-token-not-a-credential'));

      // stderr may carry structured observability, but nothing else: every line
      // must be a well-formed log event, and no line may carry a secret.
      for (const line of stderr.split('\n')) {
        if (!line.trim()) continue;
        const parsed = JSON.parse(line);
        assert.ok(typeof parsed.level === 'string', 'log line needs a level');
        assert.ok(typeof parsed.event === 'string', 'log line needs an event');
      }
      assert.ok(!stderr.includes('offline-private-detail'));
      assert.ok(!stderr.includes('offline-token-not-a-credential'));
      assert.equal(transport.pid, null, 'child must be closed after success or failure');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
}

test('CLI fails closed before contacting API without explicit --live', async () => {
  await assert.rejects(exec(process.execPath, [resolve(root, 'scripts/verify-mcp.mjs')]), (error: any) => {
    assert.equal(error.code, 1);
    assert.equal(error.stderr.trim(), 'FAIL preflight LIVE_OPT_IN_REQUIRED');
    return true;
  });
});

test('CLI missing token is nonzero; empty private fixture never uses parent secrets', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'kronos-cli-'));
  try {
    const file = join(cwd, '.env');
    await writeFile(file, '', { mode: 0o600 });
    await assert.rejects(exec(process.execPath, [resolve(root, 'scripts/verify-mcp.mjs'), '--live', '--env-file', file], {
      env: { PATH: process.env.PATH, KRONOS_MCP_TOKEN: '' },
    }), (error: any) => {
      assert.equal(error.code, 1);
      assert.equal(error.stderr.trim(), 'FAIL preflight AUTH_REQUIRED');
      return true;
    });
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
