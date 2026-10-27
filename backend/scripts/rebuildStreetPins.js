const { initDb, isPgConnected, pool } = require('../src/db');
const { rebuildAll } = require('../src/services/streetPinService');

async function main() {
  await initDb();
  if (!isPgConnected()) {
    console.log('PostgreSQL is unavailable (in-memory fallback): no street pins to rebuild.');
    return;
  }
  const { potholes, pins } = await rebuildAll({ geocode: true });
  console.log(`Linked ${potholes} potholes; ${pins} street pins in location_stats.`);
}

main()
  .catch((error) => {
    console.error(`[Street pins] ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
