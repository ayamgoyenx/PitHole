const fs = require('node:fs/promises');
const path = require('node:path');
const { initDb, isPgConnected, pool } = require('../src/db');

async function runMigrations() {
  await initDb();
  if (!isPgConnected()) {
    throw new Error('PostgreSQL is unavailable; migrations cannot run against the in-memory fallback.');
  }

  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    await pool.query(sql);
    console.log(`[Migration] Applied ${file}`);
  }
}

if (require.main === module) {
  runMigrations()
    .catch((error) => {
      console.error(`[Migration] ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { runMigrations };
