const { query, isPgConnected } = require('../db');

// This records a successful, non-empty device upload, including acknowledged retries.
// It is not detection time, admin updated_at, or the time a browser reads the API.
async function recordSuccessfulUpload(deviceId, items, results) {
  if (!isPgConnected() || typeof deviceId !== 'string' || !deviceId.trim()
      || Array.from(deviceId).length > 80 || !items.length || results.length !== items.length
      || results.some(item => !['created', 'updated', 'duplicate'].includes(item.action))) return null;
  const result = await query(`INSERT INTO device_sync_state (device_id, last_success_at)
    VALUES ($1, clock_timestamp()) ON CONFLICT (device_id) DO UPDATE
    SET last_success_at = GREATEST(device_sync_state.last_success_at, EXCLUDED.last_success_at)
    RETURNING last_success_at`, [deviceId]);
  return result.rows[0].last_success_at;
}
async function getLastDeviceSync() {
  if (!isPgConnected()) return null;
  const result = await query('SELECT MAX(last_success_at) AS last_device_sync_at FROM device_sync_state');
  return result.rows[0].last_device_sync_at;
}
module.exports = { recordSuccessfulUpload, getLastDeviceSync };
