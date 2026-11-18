const crypto = require('node:crypto');

function fail(res, code, message) { return res.status(code).json({ status: 'error', message }); }
function allowedOrigins() {
  // Keep existing Railway FRONTEND_URL settings working; the new name wins
  // when explicitly set, so stale legacy origins cannot expand the allowlist.
  const configured = (process.env.FRONTEND_ORIGINS ?? process.env.FRONTEND_URL ?? '').split(',').map(v => v.trim()).filter(Boolean);
  return new Set([...configured, ...(process.env.NODE_ENV === 'production' ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173'])]);
}
function checkOrigin(req, res, next) {
  const origin = req.headers.origin;
  if (origin && !allowedOrigins().has(origin)) return fail(res, 403, 'Origin tidak diizinkan.');
  return next();
}
function requireDevice(req, res, next) {
  const key = process.env.DEVICE_API_KEY;
  if (!key || key.length < 32) {
    if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_UNAUTHENTICATED_DEVICES === 'true') return next();
    return fail(res, 503, 'Autentikasi perangkat belum dikonfigurasi.');
  }
  const actual = crypto.createHash('sha256').update(req.get('X-Device-Key') || '').digest();
  const expected = crypto.createHash('sha256').update(key).digest();
  if (!crypto.timingSafeEqual(actual, expected)) return fail(res, 401, 'Kunci perangkat tidak valid.');
  return next();
}
function validateBatch(req, res, next) {
  const body = req.body;
  if (!body || !Array.isArray(body.potholes) || !body.potholes.length || body.potholes.length > 500) {
    return fail(res, 400, 'potholes harus berisi 1–500 laporan.');
  }
  if (typeof body.device_id !== 'string' || !body.device_id.trim() || Array.from(body.device_id).length > 80) {
    return fail(res, 400, 'device_id harus berisi 1–80 karakter.');
  }
  // Event IDs must survive retries; reject non-idempotent requests at the device API.
  if (body.potholes.some(item => !item || typeof item.event_id !== 'string' || !item.event_id.trim())) {
    return fail(res, 400, 'Setiap laporan perangkat harus memiliki event_id.');
  }
  return next();
}
function validId(req, res, next) {
  if (!/^[1-9]\d*$/.test(req.params.id) || Number(req.params.id) > 2147483647) return fail(res, 400, 'ID laporan tidak valid.');
  return next();
}
function validStreetQuery(req, res, next) {
  const { bbox, level } = req.query;
  if (bbox !== undefined) {
    const parts = typeof bbox === 'string' ? bbox.split(',') : [];
    const values = parts.map(Number);
    if (parts.length !== 4 || parts.some(v => !v.trim()) || values.some(v => !Number.isFinite(v))
        || Math.abs(values[0]) > 180 || Math.abs(values[2]) > 180 || Math.abs(values[1]) > 90 || Math.abs(values[3]) > 90
        || values[0] > values[2] || values[1] > values[3]) return fail(res, 400, 'Batas area peta tidak valid.');
  }
  if (level !== undefined && (typeof level !== 'string' || level.split(',').some(v => !['safe', 'medium', 'severe'].includes(v.trim())))) {
    return fail(res, 400, 'Level kondisi jalan tidak valid.');
  }
  return next();
}
// Bounded, single-process limit. Shared limits are needed when scaling to replicas.
function loginLimiter({ now = Date.now, limit = 10, windowMs = 15 * 60 * 1000 } = {}) {
  const attempts = new Map();
  return (req, res, next) => {
    const time = now();
    for (const [ip, entry] of attempts) if (entry.until <= time) attempts.delete(ip);
    const key = req.ip || 'unknown';
    let entry = attempts.get(key);
    if (!entry) {
      if (attempts.size >= 10000) return fail(res, 429, 'Terlalu banyak percobaan. Coba lagi nanti.');
      entry = { count: 0, until: time + windowMs }; attempts.set(key, entry);
    }
    if (++entry.count > limit) {
      res.setHeader('Retry-After', Math.ceil((entry.until - time) / 1000));
      return fail(res, 429, 'Terlalu banyak percobaan login. Coba lagi nanti.');
    }
    return next();
  };
}
function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let code = error.statusCode || error.status || 500;
  if (error.code?.startsWith('08') || ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', '57P01'].includes(error.code)) code = 503;
  if (![400, 401, 403, 404, 409, 413, 429, 503].includes(code)) code = 500;
  console.error(`[API] ${req.method} ${req.path}:`, error.message);
  const message = code === 413 ? 'Ukuran request terlalu besar.' : code === 400 ? 'Format atau nilai request tidak valid.' : code === 503 ? 'Layanan database atau perangkat belum tersedia. Coba lagi nanti.' : 'Permintaan gagal diproses.';
  return fail(res, code, message);
}
module.exports = { allowedOrigins, checkOrigin, requireDevice, validateBatch, validId, validStreetQuery, loginLimiter, errorHandler };
