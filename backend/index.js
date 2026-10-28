const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { initDb } = require('./src/db');
const potholeService = require('./src/services/potholeService');
const adminAuth = require('./src/utils/adminAuth');
const roadService = require('./src/services/roadService');
const streetPinService = require('./src/services/streetPinService');

const app = express();
const PORT = process.env.PORT || 5000;

//defining allowed origins 
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173, http://localhost:5174")
  .split(',')
  .map ((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Credentials'],
}));

app.use(express.json());

// Inisialisasi Database saat Server Mulai
initDb().then(() => {
  // Auto-seed data UGM jika database masih kosong
  potholeService.getAllPotholes().then(async (list) => {
    if (list.length === 0) {
      console.log('[Init] Mengisi data seed awal area UGM...');
      await potholeService.seedInitialPotholes();
    } else {
      await potholeService.fillMissingLocationMetadata();
      await streetPinService.rebuildAll();
    }
  }).catch((error) => console.error('[Init] Gagal melengkapi data lokasi:', error.message));
});

app.get('/api/v1/street-pins', async (req, res) => {
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
app.get('/api/hello', (req, res) => {
  res.json({
    message: 'Backend Express & Database PitHole UGM Berhasil Jalan!',
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/v1/admin/login', async (req, res) => {
  if (!adminAuth.isConfigured()) {
    console.error('[Admin] ADMIN_SESSION_SECRET is missing or invalid (needs 32+ chars).');
    return res.status(500).json({ status: 'error', message: 'Something went wrong. Please try again later.' });
  }

  try {
    const { username, password } = req.body || {};
    if (!(await adminAuth.verifyCredentials(username, password))) {
      return res.status(401).json({ status: 'error', message: 'Username or password is incorrect.' });
    }

    res.setHeader('Set-Cookie', adminAuth.sessionCookie(req, adminAuth.createSessionToken(username)));
    return res.json({ status: 'success', admin: { username } });
  } catch (error) {
    console.error('[Admin] Login failed:', error.message);
    return res.status(500).json({ status: 'error', message: 'Something went wrong. Please try again later.' });
  }
});

app.get('/api/v1/admin/session', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!adminAuth.isConfigured()) {
    console.error('[Admin] ADMIN_SESSION_SECRET is missing or invalid (needs 32+ chars).');
    return res.status(500).json({ status: 'error', message: 'Something went wrong. Please try again later.' });
  }
  const session = adminAuth.readSession(req);
  if (!session) return res.status(401).json({ status: 'error', message: 'Admin session required.' });
  return res.json({ status: 'success', admin: { username: session.sub } });
});

app.post('/api/v1/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', adminAuth.sessionCookie(req, '', 0));
  return res.json({ status: 'success' });
});

/**
 * 1. Endpoint Upload Batch dari MicroSD ESP32
 * POST /api/v1/potholes/batch-upload
 */
app.post('/api/v1/potholes/batch-upload', async (req, res) => {
  try {
    const { sync_time, potholes } = req.body;

    if (!Array.isArray(potholes)) {
      return res.status(400).json({
        status: 'error',
        message: 'Format data tidak valid. "potholes" harus berupa array.',
      });
    }

    const results = await potholeService.processBatchUpload(sync_time, potholes);

    res.status(200).json({
      status: 'success',
      message: `Berhasil memproses ${results.length} log data titik lubang.`,
      sync_time: sync_time || new Date().toISOString(),
      details: results,
    });
  } catch (error) {
    console.error('Error batch-upload:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * 2. Endpoint Download/Sync untuk ESP32
 * GET /api/v1/potholes/sync?last_sync={timestamp}
 */
app.get('/api/v1/potholes/sync', async (req, res) => {
  try {
    const { last_sync } = req.query;
    const syncData = await potholeService.getSyncData(last_sync);

    res.status(200).json({
      status: 'success',
      sync_time: new Date().toISOString(),
      count: syncData.length,
      potholes: syncData,
    });
  } catch (error) {
    console.error('Error sync:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * 3. Endpoint Ambil Seluruh Data Pothole untuk React Frontend
 * GET /api/v1/potholes
 */
app.get('/api/v1/potholes', async (req, res) => {
  try {
    const list = await potholeService.getAllPotholes();

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
      potholes: list,
    });
  } catch (error) {
    console.error('Error get all potholes:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * 4. Endpoint Ambil 1 Detail Pothole
 * GET /api/v1/potholes/:id
 */
app.get('/api/v1/potholes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const item = await potholeService.getPotholeById(id);

    if (!item) {
      return res.status(404).json({ status: 'error', message: 'Titik lubang tidak ditemukan' });
    }

    res.status(200).json({ status: 'success', pothole: item });
  } catch (error) {
    console.error('Error get pothole by id:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * 5. Endpoint Update Status Pothole (Admin)
 * PATCH /api/v1/potholes/:id/status
 */
app.patch('/api/v1/potholes/:id/status', adminAuth.requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

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
    res.status(400).json({ status: 'error', message: error.message });
  }
});

/**
 * 6. Endpoint Seed Data Dummy Area UGM (Untuk Testing)
 * POST /api/v1/potholes/seed
 */
app.post('/api/v1/potholes/seed', adminAuth.requireAdmin, async (req, res) => {
  try {
    const seeded = await potholeService.seedInitialPotholes();
    res.status(200).json({
      status: 'success',
      message: 'Berhasil mengisikan data awal (seed) jalan berlubang di area UGM.',
      count: seeded.length,
      potholes: seeded,
    });
  } catch (error) {
    console.error('Error seed:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/api/road-heat', async (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=30');
  try {
    return res.json(await roadService.getRoadHeatGeoJSON());
  } catch (error) {
    console.error('Error get road heat:', error);
    return res.status(500).json({ status: 'error', message: 'Peta panas jalan gagal dimuat.' });
  }
});

app.listen(PORT, () => {
  console.log(`[PitHole Backend Server] Berjalan di http://localhost:${PORT}`);
});