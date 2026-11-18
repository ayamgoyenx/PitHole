import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceSyncTimestamp, formatTimestamp, hasCoordinates } from '../src/utils/display.js';

test('device sync never substitutes fetch, detection, or admin update timestamps', () => {
  assert.equal(deviceSyncTimestamp({ sync_time: '2026-11-17T08:00:00Z', potholes: [{ updated_at: '2026-11-17T08:00:00Z', last_detected_at: '2026-11-17T08:00:00Z' }] }), null);
  assert.equal(deviceSyncTimestamp({ sync: { last_device_sync_at: 'invalid' } }), null);
  assert.equal(deviceSyncTimestamp({ sync: { last_device_sync_at: '2026-11-17T01:00:00Z' } }), '2026-11-17T01:00:00Z');
});
test('dates are safe and explicitly displayed in WIB across date boundaries', () => {
  assert.equal(formatTimestamp(null), '—');
  assert.equal(formatTimestamp('invalid'), '—');
  const result = formatTimestamp('2026-11-04T23:17:53Z', 'en');
  assert.match(result, /05 Nov 2026/);
  assert.match(result, /06:17:53 WIB/);
});
test('invalid coordinates cannot become an accidental zero marker', () => {
  for (const item of [{ lat: null, lon: 110 }, { lat: '', lon: 110 }, { lat: 91, lon: 110 }, { lat: 'bad', lon: 110 }]) assert.equal(hasCoordinates(item), false);
  assert.equal(hasCoordinates({ lat: 0, lon: 0 }), true);
  assert.equal(hasCoordinates({ lat: '-7.77', lon: '110.37' }), true);
});
