const { test } = require('node:test');
const assert = require('node:assert/strict');
// No .env connections: the HTTP app is imported without running start().
Object.assign(process.env, { DB_URL: '', DB_HOST: '127.0.0.1', DB_PORT: '1', NODE_ENV: 'production',
  DEVICE_API_KEY: 'test-only-device-key-12345678901234567890', FRONTEND_ORIGINS: 'https://frontend.example',
  ADMIN_SESSION_SECRET: 'test-only-session-secret-12345678901234567890' });
const { app } = require('../index');
const service = require('../src/services/potholeService');
const sync = require('../src/services/deviceSyncService');
const auth = require('../src/utils/adminAuth');
const { loginLimiter } = require('../src/utils/apiSafety');

test('HTTP boundaries protect device uploads, origins, IDs and internal errors', async t => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let writes = 0;
  service.processBatchUpload = async () => { writes++; return [{ action: 'duplicate', pothole_id: 7 }]; };
  sync.recordSuccessfulUpload = async () => '2026-11-17T00:00:00Z';
  const body = { device_id: 'SEPEDA01', potholes: [{ event_id: 'same-event', lat: -7.7, lon: 110.3 }] };
  const post = (payload, headers = {}) => fetch(base + '/api/v1/potholes/batch-upload', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload),
  });
  const key = { 'X-Device-Key': process.env.DEVICE_API_KEY };
  try {
    await t.test('missing or incorrect key cannot write', async () => {
      assert.equal((await post(body)).status, 401);
      assert.equal((await post(body, { 'X-Device-Key': 'wrong' })).status, 401);
      assert.equal(writes, 0);
    });
    await t.test('valid device receives duplicate acknowledgement with original ID', async () => {
      const r = await post(body, key); assert.equal(r.status, 200);
      assert.equal((await r.json()).details[0].pothole_id, 7);
    });
    await t.test('missing device ID, empty batch and missing event ID are rejected', async () => {
      for (const bad of [{ potholes: body.potholes }, { ...body, potholes: [] }, { ...body, potholes: [{}] }]) assert.equal((await post(bad, key)).status, 400);
      assert.equal(writes, 1);
    });
    await t.test('foreign origin rejected; allowed origin supports credentials', async () => {
      assert.equal((await post(body, { ...key, Origin: 'https://attacker.example' })).status, 403);
      const r = await fetch(base + '/', { headers: { Origin: 'https://frontend.example' } });
      assert.equal(r.headers.get('access-control-allow-origin'), 'https://frontend.example');
      assert.equal(r.headers.get('access-control-allow-credentials'), 'true');
    });
    await t.test('seed reset API is unavailable and invalid IDs return 400', async () => {
      assert.equal((await fetch(base + '/api/v1/potholes/seed', { method: 'POST' })).status, 404);
      assert.equal((await fetch(base + '/api/v1/potholes/12junk')).status, 400);
    });
    await t.test('raw database errors are not exposed', async () => {
      service.getAllPotholes = async () => { throw new Error('private table and credential detail'); };
      const r = await fetch(base + '/api/v1/potholes'); assert.equal(r.status, 500);
      assert.doesNotMatch(await r.text(), /private table/);
    });
    await t.test('malformed JSON produces a JSON error', async () => {
      const r = await fetch(base + '/api/v1/potholes/batch-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
      assert.equal(r.status, 400); assert.equal((await r.json()).status, 'error');
    });
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('login throttling expires and does not trust a client supplied header', () => {
  let time = 0, passed = 0, code;
  const limit = loginLimiter({ now: () => time, limit: 2, windowMs: 1000 });
  const res = { status(n) { code = n; return this; }, json() {}, setHeader() {} };
  const req = { ip: '127.0.0.1', headers: { 'x-forwarded-for': 'fake' } };
  for (let i = 0; i < 3; i++) limit(req, res, () => passed++);
  assert.equal(passed, 2); assert.equal(code, 429);
  time = 1001; limit(req, res, () => passed++); assert.equal(passed, 3);
});
test('session cookies support HTTPS cross-site frontend and reject malformed tokens', async () => {
  assert.equal(await auth.readSession({ headers: { cookie: `${auth.COOKIE_NAME}=malformed.extra` } }), null);
  assert.match(auth.sessionCookie({}, 'test'), /SameSite=None/);
  assert.match(auth.sessionCookie({}, 'test'), /Secure/);
});
