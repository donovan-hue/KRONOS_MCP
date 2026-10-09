import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, VerificationError, requireCondition, loadVerificationConfig } from './verification-config.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const TIMEOUT = { timeout: 15_000 };
const TOOL_NAMES = ['kronos_status', 'kronos_health', 'kronos_me', 'kronos_contracts'];
const SAFE_CODES = new Set([
  'AUTH_REQUIRED', 'FORBIDDEN', 'CONFIG_INVALID', 'UPSTREAM_TIMEOUT',
  'UPSTREAM_UNAVAILABLE', 'UPSTREAM_HTTP_ERROR', 'INVALID_RESPONSE',
  'RESPONSE_TOO_LARGE', 'INTERNAL_ERROR',
]);

function toolFailure(result) {
  // Upstream text/JSON is untrusted. Never print it, even on errors.
  try {
    const text = result.content?.find(item => item.type === 'text')?.text;
    const error = JSON.parse(text).error;
    const code = SAFE_CODES.has(error?.code) ? error.code : 'TOOL_ERROR';
    const status = Number.isInteger(error?.httpStatus) && error.httpStatus >= 400 && error.httpStatus <= 599
      ? ` HTTP_${error.httpStatus}` : '';
    return `${code}${status}`;
  } catch {
    return 'TOOL_ERROR';
  }
}

function checkSuccess(result, kind) {
  if (result.isError) throw new VerificationError(toolFailure(result));
  const data = result.structuredContent;
  requireCondition(data && typeof data === 'object' && data.ok === true, 'INVALID_OUTPUT');
  requireCondition(typeof data.service === 'string' && data.service.length > 0, 'INVALID_OUTPUT');
  if (kind === 'identity') {
    requireCondition(data.service === 'kronos-mcp' && typeof data.identity === 'string' && data.identity.trim().length > 0, 'INVALID_OUTPUT');
    requireCondition(Array.isArray(data.permissions) && data.permissions.every(p => typeof p === 'string'), 'INVALID_OUTPUT');
  } else {
    requireCondition(typeof data.database === 'string' && typeof data.realtime === 'boolean', 'INVALID_OUTPUT');
    requireCondition(typeof data.timestamp === 'string' && Number.isFinite(Date.parse(data.timestamp)), 'INVALID_OUTPUT');
  }
  // Both MCP representations must agree, not merely return a successful envelope.
  const text = result.content?.find(item => item.type === 'text')?.text;
  let decoded;
  try { decoded = JSON.parse(text); } catch { throw new VerificationError('INVALID_TEXT_OUTPUT'); }
  requireCondition(JSON.stringify(decoded) === JSON.stringify(data), 'OUTPUT_MISMATCH');
}

async function expectRejection(client, params, protocolCodes) {
  try {
    const result = await client.callTool(params, undefined, TIMEOUT);
    requireCondition(result.isError === true, 'EXPECTED_REJECTION');
  } catch (error) {
    // Protocol rejection is also permitted; a timeout/network failure is not.
    if (!protocolCodes.includes(error?.code)) throw error;
  }
}

/** Exercises a real MCP client. The transport is injectable for offline tests. */
export async function verifyMcp(transport, report = console.log) {
  const client = new Client({ name: 'kronos-mcp-verifier', version: '1.0.0' });
  let stage = 'connect';
  let failed = false;
  try {
    await client.connect(transport, TIMEOUT);
    await client.ping(TIMEOUT);
    report('PASS stdio_handshake_ping');

    stage = 'tools_list';
    const { tools } = await client.listTools(undefined, TIMEOUT);
    for (const name of TOOL_NAMES) {
      const tool = tools.find(item => item.name === name);
      requireCondition(tool?.inputSchema?.type === 'object' && tool.outputSchema, 'MISSING_TOOL_CONTRACT');
    }
    report('PASS tools_list');

    stage = 'invalid_input';
    await expectRejection(client, { name: 'kronos_me', arguments: { unexpected: true } }, [-32602]);
    report('PASS invalid_input_rejected');

    stage = 'unknown_tool';
    await expectRejection(client, { name: '__kronos_verification_unknown__', arguments: {} }, [-32601, -32602]);
    report('PASS unknown_tool_rejected');

    for (const name of ['kronos_me', 'kronos_status', 'kronos_health']) {
      stage = name;
      const result = await client.callTool({ name, arguments: {} }, undefined, TIMEOUT);
      checkSuccess(result, name === 'kronos_me' ? 'identity' : 'health');
      report(`PASS ${name}`);
    }
  } catch (error) {
    failed = true;
    const detail = error instanceof VerificationError ? error.message : 'MCP_VERIFICATION_FAILED';
    report(`FAIL ${stage} ${detail}`);
  } finally {
    try {
      await client.close();
      await transport.close();
    } catch {
      failed = true;
      report('FAIL cleanup MCP_CLOSE_FAILED');
    }
  }
  if (!failed) report('PASS MCP_VERIFICATION_COMPLETE');
  return !failed;
}

export async function main(args = process.argv.slice(2)) {
  try {
    const { envFile, token, apiUrl } = await loadVerificationConfig(args);
    try { await readFile(resolve(ROOT, 'dist/index.js')); } catch { throw new VerificationError('BUILD_REQUIRED'); }

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [resolve(ROOT, 'dist/index.js')],
      cwd: ROOT,
      env: {
        KRONOS_MCP_TOKEN: token,
        KRONOS_API_URL: apiUrl,
        DOTENV_CONFIG_PATH: envFile,
        DOTENV_CONFIG_QUIET: 'true',
        DOTENV_CONFIG_DEBUG: 'false',
        DOTENV_CONFIG_OVERRIDE: 'false',
      },
      stderr: 'ignore', // Never relay child stack traces or arbitrary backend messages.
    });
    process.exitCode = (await verifyMcp(transport)) ? 0 : 1;
  } catch (error) {
    console.error(`FAIL preflight ${error instanceof VerificationError ? error.message : 'VERIFICATION_SETUP_FAILED'}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
