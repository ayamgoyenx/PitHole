const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validTimestamp } = require('../src/utils/timestamps');
const { databaseConfig } = require('../src/config/database');
const { validStreetQuery } = require('../src/utils/apiSafety');
test('timestamps require real calendar dates and explicit time zones', () => {
  for (const value of ['', 0, false, '2026-02-30T10:00:00Z', '2026-11-18', '2026-11-18T10:00:00', '2026-11-18T24:00:00Z', '2026-11-18T10:00:00+14:30']) assert.equal(validTimestamp(value), false, String(value));
  for (const value of ['2024-02-29T10:00:00Z', '2026-11-18T10:00:00.123456Z', '2026-11-18T10:00:00+07:00']) assert.equal(validTimestamp(value), true);
});
test('cloud TLS verifies certificates and rejects URL parameters that override verification', () => {
  assert.equal(databaseConfig({ DB_URL: 'postgresql://user:example@db.example/postgres' }).ssl.rejectUnauthorized, true);
  for (const key of ['sslmode', 'ssl', 'sslrootcert', 'uselibpqcompat']) {
    assert.throws(() => databaseConfig({ DB_URL: `postgresql://db.example/postgres?${key}=disable` }), /Remove/);
  }
  assert.equal(databaseConfig({ DB_HOST: '127.0.0.1' }).ssl, undefined);
  assert.equal(databaseConfig({ DB_URL: 'postgresql://db.example/postgres', DB_SSL_CA: 'line1\\nline2' }).ssl.ca, 'line1\nline2');
});
test('bad map bounds and unknown levels fail before any database work', () => {
  for (const query of [{ bbox: '1,2,3' }, { bbox: ',2,3,4' }, { bbox: '180,0,181,1' }, { bbox: '3,2,1,4' }, { bbox: ['1,2,3,4'] }, { level: 'unknown' }]) {
    let code;
    validStreetQuery({ query }, { status(c) { code = c; return this; }, json() {} }, () => assert.fail('invalid input accepted'));
    assert.equal(code, 400);
  }
  let passed = false;
  validStreetQuery({ query: { bbox: '110,-8,111,-7', level: 'safe,medium' } }, {}, () => { passed = true; });
  assert.equal(passed, true);
});
