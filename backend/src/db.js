const { Pool } = require('pg');
require('dotenv').config();

const { databaseConfig } = require('./config/database');
const pool = new Pool(databaseConfig());

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
  let client;
  isPgConnected = false;
  try {
    client = await pool.connect();
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
    await client.query(`CREATE TABLE IF NOT EXISTS device_sync_state (
      device_id VARCHAR(80) PRIMARY KEY,
      last_success_at TIMESTAMPTZ NOT NULL
    )`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS pothole_events (
        event_id   VARCHAR(80) PRIMARY KEY,
        pothole_id INT REFERENCES potholes(id) ON DELETE SET NULL,
        received_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('[Database] Tabel "potholes" dan "pothole_events" di PostgreSQL siap digunakan.');
    isPgConnected = true;
  } catch (err) {
    isPgConnected = false;
    throw err;
  } finally {
    client?.release();
  }
}

// Avoid an unhandled pool error terminating the process. Queries still report failures.
pool.on?.('error', error => console.error('[Database] Idle connection failed:', error.message));

/**
 * Wrapper query database
 */
async function query(text, params) {
  if (isPgConnected) {
    return pool.query(text, params);
  }
  throw Object.assign(new Error('Database belum siap.'), { statusCode: 503 });
}

// Every statement in a transaction must use the same checked-out connection.
async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    const result = await work(client.query.bind(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* Preserve the original error. */ }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  withTransaction,
  initDb,
  isPgConnected: () => isPgConnected,
  memoryDb,
};
