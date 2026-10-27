const { query, isPgConnected } = require('../db');
const { STREET_PIN_CONFIG } = require('../config/streetPin');
const { classifyLocation } = require('../utils/classifyLocation');
const { findNearestRoadSegment, ROAD_SNAP_RADIUS_METERS } = require('./roadService');
const { reverseGeocode } = require('./geocoding');

const OPEN_STATUS_SQL = "LOWER(COALESCE(p.status, '')) NOT IN ('repaired', 'selesai')";
const LEVELS = ['severe', 'medium', 'safe'];

function publicConfig() {
  return {
    thresholdA: STREET_PIN_CONFIG.THRESHOLD_A,
    thresholdB: STREET_PIN_CONFIG.THRESHOLD_B,
    minEffectiveLengthM: STREET_PIN_CONFIG.MIN_EFFECTIVE_LENGTH_M,
  };
}

// Nearest road within the snap radius; the name falls back to Nominatim and never blocks saving.
async function resolveLocation(lat, lon) {
  let segment = null;
  try {
    segment = await findNearestRoadSegment(lat, lon);
  } catch (error) {
    console.warn(`[Street pin] Could not snap to a road: ${error.message}`);
  }

  let name = segment?.name || null;
  if (!name) {
    try {
      name = await reverseGeocode(lat, lon, null);
    } catch (error) {
      console.warn(`[Street pin] Geocoding failed: ${error.message}`);
    }
  }
  return { idLocation: segment?.id ?? null, locationName: name || null };
}

// Writes the pothole -> location link. `known` skips the lookup when the caller already resolved it.
async function upsertPotholeLocation(potholeId, lat, lon, known = null) {
  if (!isPgConnected()) return { locationKey: null, previousKey: null };
  const resolved = { ...(known || (await resolveLocation(lat, lon))) };

  // A pothole always takes the name of its segment, or the name the segment's other potholes already
  // have, so one road never ends up with several different names (and several pins).
  if (resolved.idLocation != null) {
    const nameLookup = await query(
      `SELECT rs.name,
              (SELECT pl.location_name FROM pothole_location pl
                WHERE pl.id_location = rs.id AND pl.pothole_id <> $2 AND pl.location_name IS NOT NULL
                LIMIT 1) AS existing
       FROM road_segments rs WHERE rs.id = $1`,
      [resolved.idLocation, potholeId]
    );
    const row = nameLookup.rows[0];
    resolved.locationName = row?.name || row?.existing || resolved.locationName;
  }
  const previous = await query('SELECT location_key FROM pothole_location WHERE pothole_id = $1', [potholeId]);
  const saved = await query(
    `INSERT INTO pothole_location (pothole_id, lat, lon, id_location, location_name)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (pothole_id) DO UPDATE
       SET lat = EXCLUDED.lat, lon = EXCLUDED.lon,
           id_location = EXCLUDED.id_location, location_name = EXCLUDED.location_name
     RETURNING location_key`,
    [potholeId, lat, lon, resolved.idLocation, resolved.locationName]
  );
  return { locationKey: saved.rows[0]?.location_key ?? null, previousKey: previous.rows[0]?.location_key ?? null };
}

// One row per ROAD (location_key = road name), summing the open potholes and the length of the
// segments that actually have open potholes. `keyFilter` limits the work to a single road.
function roadAggregateSql(keyFilter) {
  return `
    WITH seg AS (
      SELECT pl.location_key, rs.id, rs.name,
             COALESCE(rs.length_m, ST_Length(rs.geom::geography)) AS length_m,
             COUNT(*)::integer AS holes,
             MAX(pl.location_name) AS pothole_name,
             ST_LineInterpolatePoint(rs.geom, 0.5) AS mid
      FROM pothole_location pl
      JOIN potholes p ON p.id = pl.pothole_id
      JOIN road_segments rs ON rs.id = pl.id_location
      WHERE ${OPEN_STATUS_SQL} AND pl.location_key IS NOT NULL ${keyFilter ? 'AND pl.location_key = $1' : ''}
      GROUP BY pl.location_key, rs.id
    ), best AS (
      SELECT DISTINCT ON (location_key) location_key, id AS id_location,
             ST_Y(mid) AS pin_lat, ST_X(mid) AS pin_lon
      FROM seg
      ORDER BY location_key, holes DESC, length_m DESC
    )
    SELECT s.location_key, b.id_location, b.pin_lat, b.pin_lon,
           COALESCE(MAX(s.name), MAX(s.pothole_name)) AS location_name,
           SUM(s.holes)::integer AS holes,
           SUM(s.length_m) AS length_m,
           COUNT(*)::integer AS segment_count
    FROM seg s
    JOIN best b ON b.location_key = s.location_key
    GROUP BY s.location_key, b.id_location, b.pin_lat, b.pin_lon`;
}

const INSERT_STATS_SQL = `INSERT INTO location_stats
  (location_key, id_location, location_name, length_m, segment_count, hole_count, density_per_100m, level, pin_lat, pin_lon)
  SELECT location_key, id_location, location_name, length_m, segment_count, hole_count,
         density_per_100m, level, pin_lat, pin_lon
  FROM jsonb_to_recordset($1::jsonb) AS r(
    location_key text, id_location integer, location_name text, length_m double precision,
    segment_count integer, hole_count integer, density_per_100m double precision,
    level text, pin_lat double precision, pin_lon double precision)`;

function toStatsRows(rows) {
  const stats = [];
  for (const row of rows) {
    const { density, level } = classifyLocation(row.length_m, row.holes);
    if (!level) continue;
    stats.push({
      location_key: row.location_key,
      id_location: row.id_location,
      location_name: row.location_name,
      length_m: row.length_m,
      segment_count: row.segment_count,
      hole_count: row.holes,
      density_per_100m: density,
      level,
      pin_lat: row.pin_lat,
      pin_lon: row.pin_lon,
    });
  }
  return stats;
}

// Recount ONE road and upsert/delete its location_stats row.
async function recomputeLocation(locationKey) {
  if (!isPgConnected() || locationKey == null) return null;

  const result = await query(roadAggregateSql(true), [locationKey]);
  const stats = toStatsRows(result.rows);
  await query('DELETE FROM location_stats WHERE location_key = $1', [locationKey]);
  if (stats.length) await query(INSERT_STATS_SQL, [JSON.stringify(stats)]);
  return stats[0]?.level ?? null;
}

async function recomputeLocations(keys) {
  for (const key of new Set(keys.filter((value) => value != null))) {
    await recomputeLocation(key);
  }
}

// Called after a pothole is created, re-detected or its status changes. Never throws.
async function syncPothole(potholeId, lat, lon, known = null) {
  if (!isPgConnected()) return;
  try {
    if (known || !(await hasLocationRow(potholeId))) {
      const current = await upsertPotholeLocation(potholeId, lat, lon, known);
      await recomputeLocations([current.locationKey, current.previousKey]);
    } else {
      const row = await query('SELECT location_key FROM pothole_location WHERE pothole_id = $1', [potholeId]);
      await recomputeLocation(row.rows[0].location_key);
    }
  } catch (error) {
    console.warn(`[Street pin] Sync failed for pothole ${potholeId}: ${error.message}`);
  }
}

async function hasLocationRow(potholeId) {
  const result = await query('SELECT 1 FROM pothole_location WHERE pothole_id = $1', [potholeId]);
  return result.rowCount > 0;
}

/**
 * Full backfill: re-snaps every pothole, then rebuilds location_stats from scratch.
 * `geocode` additionally calls Nominatim (1 req/s) for potholes that still have no name.
 */
async function rebuildAll({ geocode = false } = {}) {
  if (!isPgConnected()) return { potholes: 0, pins: 0 };

  await query(
    `INSERT INTO pothole_location (pothole_id, lat, lon, id_location, location_name)
     SELECT p.id, p.lat, p.lon, nearest.id, COALESCE(nearest.name, p.location_name)
     FROM potholes p
     LEFT JOIN LATERAL (
       SELECT s.id, s.name
       FROM road_segments s
       WHERE ST_DWithin(s.geom::geography, ST_SetSRID(ST_MakePoint(p.lon, p.lat), 4326)::geography, $1)
       ORDER BY s.geom <-> ST_SetSRID(ST_MakePoint(p.lon, p.lat), 4326)
       LIMIT 1
     ) AS nearest ON TRUE
     WHERE p.lat IS NOT NULL AND p.lon IS NOT NULL
     ON CONFLICT (pothole_id) DO UPDATE
       SET lat = EXCLUDED.lat, lon = EXCLUDED.lon, id_location = EXCLUDED.id_location,
           location_name = COALESCE(EXCLUDED.location_name, pothole_location.location_name)`,
    [ROAD_SNAP_RADIUS_METERS]
  );

  if (geocode) {
    const unnamed = await query('SELECT pothole_id, lat, lon FROM pothole_location WHERE location_name IS NULL');
    for (const row of unnamed.rows) {
      try {
        const name = await reverseGeocode(row.lat, row.lon, null);
        if (name) await query('UPDATE pothole_location SET location_name = $1 WHERE pothole_id = $2', [name, row.pothole_id]);
      } catch (error) {
        console.warn(`[Street pin] Geocoding pothole ${row.pothole_id} failed: ${error.message}`);
      }
    }
  }

  const aggregated = await query(roadAggregateSql(false));
  const rows = toStatsRows(aggregated.rows);

  await query('DELETE FROM location_stats');
  if (rows.length) await query(INSERT_STATS_SQL, [JSON.stringify(rows)]);
  const total = await query('SELECT COUNT(*)::integer AS n FROM pothole_location');
  return { potholes: total.rows[0].n, pins: rows.length };
}

function parseBbox(bbox) {
  if (!bbox) return null;
  const parts = String(bbox).split(',').map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) return null;
  const [minLon, minLat, maxLon, maxLat] = parts;
  return { minLon, minLat, maxLon, maxLat };
}

// Read model only: one indexed query on location_stats, no joins.
async function getStreetPins({ level, bbox } = {}) {
  if (!isPgConnected()) return [];

  const params = [];
  const where = [];
  const levels = String(level || '').split(',').map((item) => item.trim()).filter((item) => LEVELS.includes(item));
  if (levels.length) {
    params.push(levels);
    where.push(`level = ANY($${params.length})`);
  }
  const box = parseBbox(bbox);
  if (box) {
    params.push(box.minLat, box.maxLat, box.minLon, box.maxLon);
    const n = params.length;
    where.push(`pin_lat BETWEEN $${n - 3} AND $${n - 2} AND pin_lon BETWEEN $${n - 1} AND $${n}`);
  }

  const result = await query(
    `SELECT location_key, id_location, location_name, level, hole_count, segment_count, length_m, density_per_100m,
            pin_lat AS lat, pin_lon AS lon
     FROM location_stats
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY density_per_100m DESC
     LIMIT 2000`,
    params
  );
  return result.rows;
}

module.exports = {
  publicConfig,
  resolveLocation,
  upsertPotholeLocation,
  recomputeLocation,
  syncPothole,
  rebuildAll,
  getStreetPins,
};
