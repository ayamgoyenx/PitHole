const { initDb, isPgConnected, pool } = require('../src/db');
const { findNearestRoadSegment } = require('../src/services/roadService');
const { reverseGeocode } = require('../src/services/geocoding');

async function backfillLocationNames() {
  await initDb();
  if (!isPgConnected()) throw new Error('PostgreSQL is unavailable; backfill requires persistent storage.');

  const result = await pool.query(
    `SELECT id, lat, lon
     FROM potholes
     WHERE location_name IS NULL
     ORDER BY id`
  );

  let updated = 0;
  let unknown = 0;
  for (const pothole of result.rows) {
    let segment = null;
    try {
      segment = await findNearestRoadSegment(pothole.lat, pothole.lon);
    } catch (error) {
      console.warn(`[Backfill] Road lookup failed for pothole ${pothole.id}: ${error.message}`);
    }

    const locationName = await reverseGeocode(pothole.lat, pothole.lon, segment?.name);
    await pool.query(
      `UPDATE potholes
       SET location_name = $1,
           segment_id = COALESCE($2, segment_id),
           needs_review = CASE WHEN $2 IS NULL THEN TRUE ELSE FALSE END
       WHERE id = $3`,
      [locationName, segment?.id ?? null, pothole.id]
    );

    if (locationName) updated += 1;
    else unknown += 1;
    console.log(`[Backfill] ${pothole.id}: ${locationName || 'Lokasi tidak diketahui'}`);
  }

  return { scanned: result.rowCount, updated, unknown };
}

if (require.main === module) {
  backfillLocationNames()
    .then((summary) => console.log(`[Backfill] Complete: ${JSON.stringify(summary)}`))
    .catch((error) => {
      console.error(`[Backfill] ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { backfillLocationNames };
