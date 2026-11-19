const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { initDb, query, pool } = require('./src/db');
const safety = require('./src/utils/apiSafety');
const potholeService = require('./src/services/potholeService');
const adminAuth = require('./src/utils/adminAuth');
const roadService = require('./src/services/roadService');
const streetPinService = require('./src/services/streetPinService');
const deviceSyncService = require('./src/services/deviceSyncService');

const app = express();
const PORT = process.env.PORT || 5000;

app.disable('x-powered-by');
// Set only when the deployment's trusted proxy topology is known.
if (process.env.TRUST_PROXY_HOPS) app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS));
app.use(cors({ origin: (origin, done) => done(null, !origin || safety.allowedOrigins().has(origin)), credentials: true }));
app.use(safety.checkOrigin);
app.use(express.json({ limit: '256kb' }));
app.use('/api/v1/admin', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

app.get('/api/v1/street-pins', safety.validStreetQuery, async (req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=15');
  try {
    const pins = await streetPinService.getStreetPins({ level: req.query.level, bbox: req.query.bbox });
    return res.json({
      status: 'success',
      config: streetPinService.publicConfig(),
      count: pins.length,
      pins: pins.map((pin) => ({
        id_location: pin.id_location,
        location_key: pin.location_key,
        location_name: pin.location_name,
        level: pin.level,
        hole_count: pin.hole_count,
        length_m: Math.round(Number(pin.length_m) * 10) / 10,
        density_per_100m: Math.round(Number(pin.density_per_100m) * 100) / 100,
        lat: pin.lat,
        lon: pin.lon,
      })),
    });
  } catch (error) {
    console.error('Error get street pins:', error);
    return res.status(500).json({ status: 'error', message: 'Pin jalan gagal dimuat.' });
  }
});

app.get('/', (req, res) => {
  res.json({ message: 'PitHole API berjalan', endpoints: ['/api/hello', '/api/v1/potholes', '/api/road-heat'] });
});

// Endpoint Health Check
app.get('/api/hello', async (req, res, next) => {
  try { await query('SELECT 1'); } catch (error) { return next(Object.assign(error, { statusCode: 503 })); }
  res.json({
    message: 'Backend Express & Database PitHole UGM Berhasil Jalan!',
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/v1/admin/login', safety.loginLimiter(), async (req, res, next) => {
  if (!adminAuth.isConfigured()) {
    console.error('[Admin] ADMIN_SESSION_SECRET is missing or invalid (needs 32+ chars).');
    return res.status(500).json({ status: 'error', message: 'Something went wrong. Please try again later.' });
  }

  try {
    const { username, password } = req.body || {};
    const credentials = await adminAuth.verifyCredentials(username, password);
    if (!credentials) {
      return res.status(401).json({ status: 'error', message: 'Username or password is incorrect.' });
    }

    res.setHeader('Set-Cookie', adminAuth.sessionCookie(req, await adminAuth.createSessionToken(credentials)));
    return res.json({ status: 'success', admin: { username } });
  } catch (error) {
    console.error('[Admin] Login failed:', error.message);
    return res.status(500).json({ status: 'error', message: 'Something went wrong. Please try again later.' });
  }
});

app.get('/api/v1/admin/session', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!adminAuth.isConfigured()) {
    console.error('[Admin] ADMIN_SESSION_SECRET is missing or invalid (needs 32+ chars).');
    return res.status(500).json({ status: 'error', message: 'Something went wrong. Please try again later.' });
  }
  const session = await adminAuth.readSession(req);
  if (!session) return res.status(401).json({ status: 'error', message: 'Admin session required.' });
  return res.json({ status: 'success', admin: { username: session.sub } });
});

app.post('/api/v1/admin/logout', async (req, res) => {
  await adminAuth.revokeSession(req);
  res.setHeader('Set-Cookie', adminAuth.sessionCookie(req, '', 0));
  return res.json({ status: 'success' });
});

/**
 * 1. Endpoint Upload Batch dari MicroSD ESP32
 * POST /api/v1/potholes/batch-upload
 */
app.post('/api/v1/potholes/batch-upload', safety.requireDevice, safety.validateBatch, async (req, res, next) => {
  try {
    const { sync_time, potholes } = req.body;

    if (!Array.isArray(potholes)) {
      return res.status(400).json({
        status: 'error',
        message: 'Format data tidak valid. "potholes" harus berupa array.',
      });
    }

    const results = await potholeService.processBatchUpload(sync_time, potholes);
    const deviceSyncAt = await deviceSyncService.recordSuccessfulUpload(req.body.device_id, potholes, results);

    res.status(200).json({
      status: 'success',
      message: `Berhasil memproses ${results.length} log data titik lubang.`,
      sync_time: sync_time || new Date().toISOString(),
      details: results,
      device_sync_at: deviceSyncAt,
    });
  } catch (error) {
    console.error('Error batch-upload:', error);
    return next(error);
  }
});

/**
 * 2. Endpoint Download/Sync untuk ESP32
 * GET /api/v1/potholes/sync?last_sync={timestamp}
 */
app.get('/api/v1/potholes/sync', safety.requireDevice, async (req, res, next) => {
  try {
    const { last_sync } = req.query;
    const snapshot = await potholeService.getSyncSnapshot(last_sync);
    const syncData = snapshot.potholes;
    res.setHeader('Cache-Control', 'no-store');

    res.status(200).json({
      status: 'success',
      sync_time: snapshot.sync_time,
      count: syncData.length,
      potholes: syncData,
    });
  } catch (error) {
    console.error('Error sync:', error);
    return next(error);
  }
});

/**
 * 3. Endpoint Ambil Seluruh Data Pothole untuk React Frontend
 * GET /api/v1/potholes
 */
app.get('/api/v1/potholes', async (req, res, next) => {
  try {
    const list = await potholeService.getAllPotholes();
    const lastDeviceSync = await deviceSyncService.getLastDeviceSync();
    res.setHeader('Cache-Control', 'no-store');

    // Hitung ringkasan statistik
    const stats = {
      total: list.length,
      active: list.filter((p) => p.status === 'active').length,
      in_progress: list.filter((p) => p.status === 'in_progress').length,
      repaired: list.filter((p) => p.status === 'repaired').length,
    };

    res.status(200).json({
      status: 'success',
      stats,
      sync: { last_device_sync_at: lastDeviceSync },
      potholes: list,
    });
  } catch (error) {
    console.error('Error get all potholes:', error);
    return next(error);
  }
});

/**
 * 4. Endpoint Ambil 1 Detail Pothole
 * GET /api/v1/potholes/:id
 */
app.get('/api/v1/potholes/:id', safety.validId, async (req, res, next) => {
  try {
    const { id } = req.params;
    const item = await potholeService.getPotholeById(id);

    if (!item) {
      return res.status(404).json({ status: 'error', message: 'Titik lubang tidak ditemukan' });
    }

    res.status(200).json({ status: 'success', pothole: item });
  } catch (error) {
    console.error('Error get pothole by id:', error);
    return next(error);
  }
});

/**
 * 5. Endpoint Update Status Pothole (Admin)
 * PATCH /api/v1/potholes/:id/status
 */
app.patch('/api/v1/potholes/:id/status', adminAuth.requireAdmin, safety.validId, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    const updated = await potholeService.updatePotholeStatus(id, status);

    if (!updated) {
      return res.status(404).json({ status: 'error', message: 'Titik lubang tidak ditemukan' });
    }

    res.status(200).json({
      status: 'success',
      message: `Status lubang #${id} berhasil diperbarui menjadi '${status}'`,
      pothole: updated,
    });
  } catch (error) {
    console.error('Error update status:', error);
    return next(error);
  }
});

app.get('/api/road-heat', async (req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=30');
  try {
    return res.json(await roadService.getRoadHeatGeoJSON());
  } catch (error) {
    console.error('Error get road heat:', error);
    return res.status(500).json({ status: 'error', message: 'Peta panas jalan gagal dimuat.' });
  }
});

app.use(safety.errorHandler);

async function start() {
  await initDb();
  // Refuse to serve an incompletely migrated schema.
  await query('SELECT location_name, segment_id, needs_review FROM potholes LIMIT 0');
  await query('SELECT 1 FROM admins LIMIT 0');
  await query('SELECT 1 FROM admin_sessions LIMIT 0');
  await query('SELECT 1 FROM street_pin_jobs LIMIT 0');
  const recoveryTriggers = await query(`SELECT COUNT(*)::int AS n FROM pg_trigger WHERE tgenabled = 'O' AND
    ((tgrelid = 'potholes'::regclass AND tgname = 'potholes_pin_rebuild') OR
     (tgrelid = 'road_segments'::regclass AND tgname = 'roads_pin_rebuild') OR
     (tgrelid = 'admins'::regclass AND tgname = 'admin_credentials_changed'))`);
  if (recoveryTriggers.rows[0].n !== 3) throw new Error('Run npm run migrate: migration 007 triggers required.');
  await query('SELECT 1 FROM location_stats LIMIT 0');
  const trigger = await query("SELECT 1 FROM pg_trigger WHERE tgrelid = 'potholes'::regclass AND tgname = 'pithole_write_time' AND tgenabled = 'O'");
  if (!trigger.rowCount) throw new Error('Run npm run migrate before starting backend (migration 006 required).');
  const stopRecovery = streetPinService.startRecoveryWorker();
  const server = app.listen(PORT, () => console.log(`[PitHole Backend Server] Berjalan di http://localhost:${PORT}`));
  server.once('close', stopRecovery);
  server.once('error', stopRecovery);
  return server;
}
if (require.main === module) start().catch(async error => {
  console.error('[Startup] Backend tidak dimulai:', error.message);
  await pool.end(); process.exitCode = 1;
});
module.exports = { app, start };
