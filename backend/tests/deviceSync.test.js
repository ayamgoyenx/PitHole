const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('sync time only records fully processed, non-empty identified device uploads', async () => {
  const calls = [];
  const timestamp = '2026-11-17T01:00:00Z';
  const context = { module: { exports: {} }, require: () => ({ isPgConnected: () => true, query: async (sql, params) => {
    calls.push({ sql, params }); return { rows: [{ last_success_at: timestamp, last_device_sync_at: timestamp }] };
  } }) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services/deviceSyncService.js'), 'utf8'), context);
  const { recordSuccessfulUpload, getLastDeviceSync } = context.module.exports;
  const items = [{ event_id: 'original' }];
  for (const [id, list, results] of [[null, items, [{ action: 'created' }]], ['bike', [], []], ['bike', items, []], ['bike', items, [{ action: 'invalid' }]]]) {
    assert.equal(await recordSuccessfulUpload(id, list, results), null);
  }
  assert.equal(calls.length, 0);
  assert.equal(await recordSuccessfulUpload('bike', items, [{ action: 'duplicate' }]), timestamp);
  assert.match(calls[0].sql, /clock_timestamp\(\)/);
  assert.match(calls[0].sql, /GREATEST/);
  assert.equal(await getLastDeviceSync(), timestamp);
  assert.match(calls[1].sql, /SELECT MAX/);
});
