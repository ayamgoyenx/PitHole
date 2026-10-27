const { Pool } = require('pg');
require('dotenv').config();

// Konfigurasi pool PostgreSQL dari variabel lingkungan
// DATABASE_URL (e.g. Supabase) takes priority over the separate DB_* variables
const pool = new Pool(
  process.env.DB_URL
    ? {
      connectionString: process.env.DB_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    }
    : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'pithole_db',
      connectionTimeoutMillis: 5000,
    }
);

let isPgConnected = false;
// Storage fallback jika database PostgreSQL belum berjalan di sistem pengguna
const memoryDb = {
  potholes: [],
  nextId: 1,
};

/**
 * Inisialisasi tabel PostgreSQL
 */
async function initDb() {
  try {
    const client = await pool.connect();
    isPgConnected = true;
    console.log(`[Database] Terhubung ke PostgreSQL: ${process.env.DB_NAME || 'pithole_db'} di ${process.env.DB_HOST || 'localhost'}`);

    // Buat tabel potholes jika belum ada
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS potholes (
        id SERIAL PRIMARY KEY,
        lat DOUBLE PRECISION NOT NULL,
        lon DOUBLE PRECISION NOT NULL,
        report_count INT DEFAULT 1,
        status VARCHAR(50) DEFAULT 'active',
        first_detected_at TIMESTAMPTZ NOT NULL,
        last_detected_at TIMESTAMPTZ NOT NULL,
        repaired_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        validation_methods JSONB DEFAULT '["camera", "imu"]'::jsonb
      );
    `;

    await client.query(createTableQuery);
    await client.query('ALTER TABLE potholes ADD COLUMN IF NOT EXISTS repaired_at TIMESTAMPTZ');
    console.log('[Database] Tabel "potholes" di PostgreSQL siap digunakan.');
    client.release();
  } catch (err) {
    isPgConnected = false;
    console.warn(
      `[Database Warning] Tidak dapat terhubung ke PostgreSQL (${err.message}). ` +
      `Sistem akan beralih ke memori sementara (In-Memory Fallback) agar server Express & frontend tetap berjalan lancar.`
    );
  }
}

/**
 * Wrapper query database
 */
async function query(text, params) {
  if (isPgConnected) {
    return pool.query(text, params);
  }
  return null;
}

module.exports = {
  pool,
  query,
  initDb,
  isPgConnected: () => isPgConnected,
  memoryDb,
};
