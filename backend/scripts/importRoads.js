const { initDb, isPgConnected, pool } = require('../src/db');
const { resnapAllPotholes } = require('../src/services/roadService');
const { rebuildAll } = require('../src/services/streetPinService');

const BBOX = '-7.79,110.35,-7.74,110.40';
const OVERPASS_ENDPOINT = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
const HIGHWAY_TYPES = 'primary|secondary|tertiary|residential|unclassified|service';

function buildOverpassQuery() {
  return `[out:json][timeout:60];\nway["highway"~"^(${HIGHWAY_TYPES})$"](${BBOX});\nout geom;`;
}

const OVERPASS_ENDPOINTS = [
  OVERPASS_ENDPOINT,
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
].filter((url, index, all) => all.indexOf(url) === index);
const FETCH_ROUNDS = 3;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchFromEndpoint(endpoint) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': process.env.OVERPASS_USER_AGENT || process.env.NOMINATIM_USER_AGENT || 'PitHoleRoadImporter/1.0',
    },
    body: new URLSearchParams({ data: buildOverpassQuery() }),
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  // Overpass can answer 200 with a "remark" and no elements when it is overloaded or times out.
  if (payload.remark && !(payload.elements || []).length) throw new Error(payload.remark);
  const ways = (payload.elements || []).filter((element) => element.type === 'way' && element.geometry?.length >= 2);
  if (!ways.length) throw new Error('no roads returned');
  return ways;
}

// Tries each Overpass mirror, retrying the whole list with a growing delay (429/504 are common).
async function fetchRoadWays() {
  let lastError;
  for (let round = 1; round <= FETCH_ROUNDS; round += 1) {
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        console.log(`Overpass attempt ${round}/${FETCH_ROUNDS}: ${endpoint}`);
        return await fetchFromEndpoint(endpoint);
      } catch (error) {
        lastError = error;
        console.warn(`  failed: ${error.message}`);
      }
    }
    if (round < FETCH_ROUNDS) await sleep(round * 10000);
  }
  throw new Error(`All Overpass endpoints failed (last error: ${lastError.message})`);
}

// Cutting rules (meters, geography length)
const MIN_WAY_LENGTH_M = 30;
const MAX_SINGLE_SEGMENT_M = 150;
const TARGET_SEGMENT_M = 125;
const NEIGHBOR_TOUCH_M = 1;

// Merge ways shorter than MIN_WAY_LENGTH_M into a touching way with the same name, else skip them.
async function mergeShortWays(client) {
  const shortWays = await client.query(
    `SELECT osm_id, name FROM road_import_source
     WHERE ST_Length(geom::geography) < $1
     ORDER BY osm_id`,
    [MIN_WAY_LENGTH_M]
  );

  let merged = 0;
  let skipped = 0;
  for (const way of shortWays.rows) {
    let done = false;
    if (way.name) {
      const neighbors = await client.query(
        `SELECT n.osm_id
         FROM road_import_source AS n, road_import_source AS s
         WHERE s.osm_id = $1 AND n.osm_id <> s.osm_id AND n.name = s.name
           AND ST_DWithin(n.geom::geography, s.geom::geography, $2)
         ORDER BY ST_Length(n.geom::geography) DESC`,
        [way.osm_id, NEIGHBOR_TOUCH_M]
      );
      for (const neighbor of neighbors.rows) {
        const update = await client.query(
          `UPDATE road_import_source AS n
           SET geom = ST_LineMerge(ST_Union(n.geom, s.geom))
           FROM road_import_source AS s
           WHERE n.osm_id = $1 AND s.osm_id = $2
             AND GeometryType(ST_LineMerge(ST_Union(n.geom, s.geom))) = 'LINESTRING'`,
          [neighbor.osm_id, way.osm_id]
        );
        if (update.rowCount) {
          done = true;
          break;
        }
      }
    }
    await client.query('DELETE FROM road_import_source WHERE osm_id = $1', [way.osm_id]);
    if (done) merged += 1;
    else skipped += 1;
}
  return { merged, skipped };
}

async function importRoadWays(ways) {
  await initDb();
  if (!isPgConnected()) throw new Error('PostgreSQL is unavailable; road import cannot use the in-memory fallback.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TEMP TABLE road_import_source (
        osm_id BIGINT PRIMARY KEY,
        name TEXT,
        geom GEOMETRY(LineString, 4326) NOT NULL
      ) ON COMMIT DROP
    `);

    // Batched inserts: one round trip per 500 ways instead of one per way (slow on a remote DB).
    const rows = [];
    for (const way of ways) {
      const coordinates = way.geometry.map((point) => [Number(point.lon), Number(point.lat)]);
      if (coordinates.some(([lon, lat]) => !Number.isFinite(lon) || !Number.isFinite(lat))) continue;
      rows.push({ osm_id: way.id, name: way.tags?.name || null, geometry: { type: 'LineString', coordinates } });
    }
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      await client.query(
        `INSERT INTO road_import_source (osm_id, name, geom)
         SELECT r.osm_id, r.name, ST_SetSRID(ST_GeomFromGeoJSON(r.geometry::text), 4326)
         FROM jsonb_to_recordset($1::jsonb) AS r(osm_id bigint, name text, geometry jsonb)
         ON CONFLICT (osm_id) DO NOTHING`,
        [JSON.stringify(rows.slice(i, i + BATCH))]
      );
    }

    const { merged, skipped } = await mergeShortWays(client);

    // Idempotent reload; potholes.segment_id is set to NULL by the FK and re-snapped below.
    await client.query('DELETE FROM road_segments');
    await client.query(
      `INSERT INTO road_segments (osm_id, part_index, name, length_m, geom)
       SELECT w.osm_id, p.i, w.name, ST_Length(s.piece::geography), s.piece
       FROM (
         SELECT osm_id, name, geom, ST_Length(geom::geography) AS l,
                CASE WHEN ST_Length(geom::geography) <= $1 THEN 1
                     ELSE GREATEST(round(ST_Length(geom::geography) / $2)::integer, 1) END AS n
         FROM road_import_source
       ) AS w
       CROSS JOIN LATERAL generate_series(0, w.n - 1) AS p(i)
       CROSS JOIN LATERAL (
         SELECT CASE WHEN w.n = 1 THEN w.geom
                     ELSE ST_LineSubstring(w.geom, p.i::float / w.n, (p.i + 1)::float / w.n) END AS piece
       ) AS s
       WHERE w.l > 0 AND GeometryType(s.piece) = 'LINESTRING'`,
      [MAX_SINGLE_SEGMENT_M, TARGET_SEGMENT_M]
    );

    const stats = await client.query(
      `SELECT COUNT(*)::integer AS total,
              MIN(length_m) AS min_m, AVG(length_m) AS avg_m, MAX(length_m) AS max_m
       FROM road_segments`
    );
    await client.query('COMMIT');
    return { ...stats.rows[0], merged, skipped, ways: ways.length };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function printSummary(summary) {
  const fmt = (value) => (value == null ? 'n/a' : `${Number(value).toFixed(1)} m`);
  console.log(`Segments: ${summary.total} (from ${summary.ways} OSM ways)`);
  console.log(`Length min/avg/max: ${fmt(summary.min_m)} / ${fmt(summary.avg_m)} / ${fmt(summary.max_m)}`);
  console.log(`Short ways (< ${MIN_WAY_LENGTH_M} m): merged ${summary.merged}, skipped ${summary.skipped}`);
}

async function main() {
  console.log(`Fetching OSM roads for bbox ${BBOX}...`);
  const ways = await fetchRoadWays();
  const summary = await importRoadWays(ways);
  printSummary(summary);
  const snapped = await resnapAllPotholes();
  console.log(`Re-snapped ${snapped} potholes. Now run: npm run backfill-location-names`);
  const { pins } = await rebuildAll();
  console.log(`Street pins rebuilt: ${pins}`);
  }

  if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`[Road import] ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { BBOX, buildOverpassQuery, fetchRoadWays, importRoadWays };
