import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import * as http from "../src/services/kronos-api.js";
import { getKronosMe } from "../src/services/kronos-auth.js";
import { toolError } from "../src/tools/tool-error.js";
import { diagnoseKronos, safeTarget } from "../scripts/diagnose-kronos.mjs";
import { loadVerificationConfig } from "../scripts/verification-config.mjs";

const api = { ...http, getKronosMe };
const config = {
  apiUrl: 'https://offline.invalid/', token: 'offline-diagnostic-token',
  apiUrlSource: 'env_file', tokenSource: 'env_file',
};
const identity = { ok: true, service: 'kronos-mcp', identity: 'DO_NOT_PRINT_IDENTITY', permissions: ['DO_NOT_PRINT_PERMISSIONS'] };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

test('same 10 second deadline covers stalled headers and stalled body (real loopback HTTP, no KRONOS)', { timeout: 30_000 }, async () => {
  const servers = await Promise.all(['headers', 'body'].map(async phase => {
    const server = createServer((req, res) => {
      if (req.url !== '/api/mcp/me') { res.writeHead(404).end(); return; }
      if (phase === 'body') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.write('{');
      }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return { server, phase };
  }));
  try {
    assert.equal(http.REQUEST_TIMEOUT_MS, 10_000);
    await Promise.all(servers.map(async ({ server, phase }) => {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const start = performance.now();
      await assert.rejects(getKronosMe({
        baseUrl: `http://127.0.0.1:${address.port}`, token: config.token,
      }), (error: unknown) => {
        assert.ok(error instanceof http.KronosApiError);
        assert.equal(error.code, 'UPSTREAM_TIMEOUT');
        assert.equal(error.httpStatus, phase === 'body' ? 200 : undefined);
        assert.equal(JSON.parse(toolError(error).content[0].text).error.code, 'UPSTREAM_TIMEOUT');
        return true;
      });
      assert.ok(performance.now() - start >= 9_000, 'request did not use real deadline');
    }));
  } finally {
    await Promise.all(servers.map(({ server }) => {
      server.closeAllConnections();
      return new Promise<void>(resolve => server.close(() => resolve()));
    }));
  }
});

test('broken body is normalized without leaking stream error', async () => {
  await assert.rejects(getKronosMe({ ...config, baseUrl: config.apiUrl, fetchImpl: async () => new Response(new ReadableStream({
    start(controller) { controller.error(new Error('private-stream-detail')); },
  }), { headers: { 'content-type': 'application/json' } }) }), (error: unknown) => {
    assert.ok(error instanceof http.KronosApiError);
    assert.equal(error.code, 'UPSTREAM_UNAVAILABLE');
    assert.equal(error.httpStatus, 200);
    assert.ok(!JSON.stringify(toolError(error)).includes('private-stream-detail'));
    return true;
  });
});

for (const kind of ['non-json', 'content-length'] as const) {
  test(`unread ${kind} response body is cancelled`, async () => {
    let cancelled = false;
    const body = new ReadableStream({ cancel() { cancelled = true; } });
    await assert.rejects(getKronosMe({ token: config.token, baseUrl: config.apiUrl, fetchImpl: async () => new Response(body, { headers: kind === 'non-json'
      ? { 'content-type': 'text/html' }
      : { 'content-type': 'application/json', 'content-length': '1048577' },
    }) }));
    assert.equal(cancelled, true);
  });
}

test('diagnosis uses same token, normalized URL, /me first then /status; no bodies or identity printed', async () => {
  const calls: string[] = [];
  const reports: string[] = [];
  const passed = await diagnoseKronos(config, api, async (input: string, init: RequestInit) => {
    calls.push(String(input));
    assert.equal(new Headers(init.headers).get('authorization'), `Bearer ${config.token}`);
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal);
    return json({ ...identity, authenticated: true, token: config.token });
  }, (line: string) => reports.push(line));
  assert.equal(passed, true);
  assert.deepEqual(calls, ['https://offline.invalid/api/mcp/me', 'https://offline.invalid/api/mcp/status']);
  const text = reports.join('\n');
  for (const secret of [config.token, identity.identity, ...identity.permissions]) assert.ok(!text.includes(secret));
  const [info, me, status] = reports.map(line => JSON.parse(line.slice(line.indexOf(' ') + 1)));
  assert.equal(info.httpTimeoutMs, 10_000);
  assert.equal(info.apiUrlSource, 'env_file');
  for (const result of [me, status]) {
    assert.equal(result.httpStatus, 200);
    assert.equal(result.phase, 'complete');
    assert.equal(result.contractValid, true);
    assert.ok(result.elapsedMs >= result.headersMs);
  }
});

for (const [failure, expected] of [['headers-timeout', 'UPSTREAM_TIMEOUT'], ['body-timeout', 'UPSTREAM_TIMEOUT'], ['invalid-json', 'INVALID_RESPONSE'], ['401', 'UPSTREAM_HTTP_ERROR']] as const) {
  test(`diagnosis isolates /me ${failure} from /status success`, async () => {
    const reports: string[] = [];
    const passed = await diagnoseKronos(config, api, async (input: string) => {
      if (String(input).endsWith('/status')) return json({ ...identity, authenticated: true });
      if (failure === 'headers-timeout') throw new DOMException(config.token, 'TimeoutError');
      if (failure === 'body-timeout') return new Response(new ReadableStream({
        start(controller) { controller.error(new DOMException(config.token, 'TimeoutError')); },
      }), { headers: { 'content-type': 'application/json' } });
      if (failure === '401') return json({ error: config.token }, 401);
      return new Response(config.token, { headers: { 'content-type': 'application/json' } });
    }, (line: string) => reports.push(line));
    assert.equal(passed, false);
    const result = JSON.parse(reports[1].slice(5));
    assert.equal(result.code, expected);
    assert.equal(result.phase, failure === 'headers-timeout' ? 'awaiting_headers' : 'body_or_validation');
    assert.equal(result.httpStatus, failure === 'headers-timeout' ? null : failure === '401' ? 401 : 200);
    assert.ok(reports[2].startsWith('PASS '));
    assert.ok(!reports.join('\n').includes(config.token));
  });
}

test('target display redacts arbitrary base path and reports /api duplication risk', () => {
  const target = safeTarget(`https://offline.invalid/private-${config.token}/api`, '/api/mcp/me', config.token);
  assert.equal(target.url, 'https://offline.invalid/[BASE_PATH_REDACTED]/api/mcp/me');
  assert.equal(target.basePathPresent, true);
  assert.equal(target.basePathEndsWithApi, true);
  assert.ok(!JSON.stringify(target).includes(config.token));
});

test('diagnosis and verification share process > file > default precedence without rewriting file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kronos-config-'));
  const file = join(dir, '.env');
  try {
    await writeFile(file, 'KRONOS_MCP_TOKEN=offline-file-token\nKRONOS_API_URL=https://file.invalid\n', { mode: 0o600 });
    const fromFile = await loadVerificationConfig(['--live', '--env-file', file], {});
    assert.equal(fromFile.apiUrlSource, 'env_file');
    assert.equal(fromFile.apiUrl, 'https://file.invalid');
    const fromProcess = await loadVerificationConfig(['--live', '--env-file', file], {
      KRONOS_MCP_TOKEN: 'offline-env-token', KRONOS_API_URL: 'https://process.invalid',
    });
    assert.equal(fromProcess.apiUrlSource, 'process_env');
    assert.equal(fromProcess.tokenSource, 'process_env');
    assert.equal(fromProcess.apiUrl, 'https://process.invalid');
    await assert.rejects(loadVerificationConfig(['--live', '--env-file', file], { KRONOS_MCP_TOKEN: '' }), /AUTH_REQUIRED/);
    const after = await loadVerificationConfig(['--live', '--env-file', file], {});
    assert.equal(after.token, fromFile.token);
    assert.equal(after.apiUrl, fromFile.apiUrl);
    await writeFile(file, 'KRONOS_MCP_TOKEN=offline-file-token\n');
    const defaults = await loadVerificationConfig(['--live', '--env-file', file], {});
    assert.equal(defaults.apiUrlSource, 'default');
    assert.equal(defaults.apiUrl, 'https://api.kronos-space.com');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('diagnostic CLI refuses to load files or connect without --live', async () => {
  await assert.rejects(promisify(execFile)(process.execPath, [resolve('scripts/diagnose-kronos.mjs')]), (error: any) => {
    assert.equal(error.code, 1);
    assert.equal(error.stderr.trim(), 'FAIL preflight LIVE_OPT_IN_REQUIRED');
    return true;
  });
});
