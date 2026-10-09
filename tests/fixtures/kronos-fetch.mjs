// Preloaded ONLY by offline stdio tests, never by the live verifier.
// Every fetch is intercepted: no call reaches a real API.
const scenario = process.env.TEST_SCENARIO;
const sentinel = 'offline-private-detail';
const health = {
  ok: true, service: 'kronos-space', database: 'connected', realtime: true,
  timestamp: '2026-10-04T00:00:00.000Z',
  build: { commit: null, traceable: false },
};
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});

globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.origin !== 'https://offline.invalid' || init.redirect !== 'error') throw new Error(sentinel);
  const auth = new Headers(init.headers).get('authorization');
  if (url.pathname === '/api/mcp/me') {
    if (auth !== 'Bearer offline-token-not-a-credential') throw new Error(sentinel);
    if (scenario === '401') return json({ error: sentinel }, 401);
    if (scenario === '403') return json({ error: sentinel }, 403);
    if (scenario === '429') return json({ error: sentinel }, 429);
    if (scenario === 'network') throw new Error(sentinel);
    if (scenario === 'invalid-json') return new Response(sentinel, { headers: { 'content-type': 'application/json' } });
    if (scenario === 'invalid-schema') return json({ token: sentinel, ok: true });
    return json({
      ok: scenario !== 'ok-false', service: 'kronos-mcp',
      identity: sentinel, permissions: ['status', 'health', 'me'],
    });
  }
  if (url.pathname === '/api/health') {
    if (auth !== null) throw new Error(sentinel);
    if (scenario === 'health-503') return json({ ...health, ok: false, error: sentinel }, 503);
    return json(health);
  }
  throw new Error(sentinel);
};
