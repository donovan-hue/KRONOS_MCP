import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, VerificationError, loadVerificationConfig } from './verification-config.mjs';

const SAFE_CODES = new Set([
  'AUTH_REQUIRED', 'FORBIDDEN', 'CONFIG_INVALID', 'UPSTREAM_TIMEOUT',
  'UPSTREAM_UNAVAILABLE', 'UPSTREAM_HTTP_ERROR', 'INVALID_RESPONSE',
  'RESPONSE_TOO_LARGE', 'INTERNAL_ERROR',
]);
const elapsed = start => Math.max(0, Math.round(performance.now() - start));

/** Display the public target, never userinfo/query/arbitrary base paths/secrets. */
export function safeTarget(baseUrl, endpoint, token) {
  const parsed = new URL(baseUrl);
  const path = parsed.pathname.replace(/\/+$/, '');
  let origin = parsed.origin;
  for (const value of new Set([token, encodeURIComponent(token)])) {
    if (value) origin = origin.split(value).join('[REDACTED]');
  }
  return {
    url: `${origin}${path ? '/[BASE_PATH_REDACTED]' : ''}${endpoint}`,
    basePathPresent: Boolean(path),
    basePathEndsWithApi: /\/api$/i.test(path),
  };
}

/** Same service functions and HTTP budget as kronos_me, without MCP overhead. */
export async function diagnoseKronos(config, api, fetchImpl = globalThis.fetch, report = console.log) {
  // Mirror getKronosConfig's current trailing-slash normalization exactly.
  const baseUrl = config.apiUrl.replace(/\/+$/, '');
  report(`INFO ${JSON.stringify({
    ...safeTarget(baseUrl, '/api/mcp/me', config.token),
    apiUrlSource: config.apiUrlSource,
    tokenSource: config.tokenSource,
    httpTimeoutMs: api.REQUEST_TIMEOUT_MS,
    verifierMcpTimeoutMs: 15_000,
    redirects: 'error', retries: 0,
  })}`);

  let failed = false;
  // /me first: do not hide a first-request delay by warming /status first.
  for (const endpoint of ['/api/mcp/me', '/api/mcp/status']) {
    const start = performance.now();
    let headersMs = null;
    let httpStatus = null;
    let jsonContentType = null;
    const trackedFetch = async (input, init) => {
      const response = await fetchImpl(input, init);
      headersMs = elapsed(start);
      httpStatus = response.status;
      const type = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
      jsonContentType = type === 'application/json' || Boolean(type?.endsWith('+json'));
      return response;
    };
    let code = null;
    let valid = false;
    try {
      const options = { baseUrl, token: config.token, fetchImpl: trackedFetch };
      const data = endpoint === '/api/mcp/me'
        ? await api.getKronosMe(options)
        : await api.requestKronosJson(endpoint, config.token, options);
      valid = data?.ok === true && data.service === 'kronos-mcp'
        && typeof data.identity === 'string' && data.identity.trim().length > 0
        && Array.isArray(data.permissions) && data.permissions.every(p => typeof p === 'string')
        && (endpoint !== '/api/mcp/status' || data.authenticated === true);
      if (!valid) code = 'INVALID_RESPONSE';
    } catch (error) {
      code = error instanceof api.KronosApiError && SAFE_CODES.has(error.code)
        ? error.code : 'DIAGNOSTIC_FAILED';
    }
    if (!valid) failed = true;
    const result = {
      ...safeTarget(baseUrl, endpoint, config.token),
      headersMs, elapsedMs: elapsed(start), httpStatus, jsonContentType,
      phase: headersMs === null ? 'awaiting_headers' : valid ? 'complete' : 'body_or_validation',
      contractValid: valid, ...(code ? { code } : {}),
    };
    report(`${valid ? 'PASS' : 'FAIL'} ${JSON.stringify(result)}`);
  }
  return !failed;
}

export async function main(args = process.argv.slice(2)) {
  try {
    const config = await loadVerificationConfig(args);
    let api;
    try {
      api = {
        ...await import(pathToFileURL(resolve(ROOT, 'dist/services/kronos-api.js')).href),
        ...await import(pathToFileURL(resolve(ROOT, 'dist/services/kronos-auth.js')).href),
      };
      if (api.REQUEST_TIMEOUT_MS !== 10_000) throw new Error();
    } catch { throw new VerificationError('BUILD_REQUIRED'); }
    process.exitCode = (await diagnoseKronos(config, api)) ? 0 : 1;
  } catch (error) {
    console.error(`FAIL preflight ${error instanceof VerificationError ? error.message : 'DIAGNOSTIC_SETUP_FAILED'}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
