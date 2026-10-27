const { initDb, isPgConnected, pool } = require('../src/db');
const { findNearestRoadSegment, invalidateRoadHeatCache } = require('../src/services/roadService');
const { rebuildAll } = require('../src/services/streetPinService');
const { classifySegment } = require('../src/utils/classifySegment');
const { HEATMAP_CONFIG } = require('../src/config/heatmap');

const RANDOM_SEED = 20261021;
const TOTAL_POTHOLES = 80;
const BBOX = { west: 110.368, south: -7.780, east: 110.388, north: -7.762 };
const REFERENCE_DATE = new Date('2026-10-21T00:00:00+07:00');
const DAY_MS = 24 * 60 * 60 * 1000;
const STATUS_TARGET_SHARE = { active: 0.6, in_progress: 0.2, repaired: 0.2 };
const NON_ACTIVE = ['in_progress', 'repaired'];

// Deterministic PRNG (mulberry32) so the dataset is reproducible
function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = createRng(RANDOM_SEED);
const randInt = (min, max) => min + Math.floor(rng() * (max - min + 1));
const pick = (items) => items[Math.floor(rng() * items.length)];

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const effectiveLength = (segment) => Math.max(Number(segment.length_m), HEATMAP_CONFIG.MIN_EFFECTIVE_LENGTH_M);

async function clearSeed() {
  const result = await pool.query("DELETE FROM potholes WHERE source = 'seed'");
  invalidateRoadHeatCache();
  await rebuildStreetPins();
  return result.rowCount;
}

async function rebuildStreetPins() {
  try {
    await rebuildAll();
  } catch (error) {
    console.warn(`[Street pins] Rebuild skipped (run npm run migrate): ${error.message}`);
  }
}

async function loadSegments() {
  const result = await pool.query(
    `SELECT id, name, COALESCE(length_m, ST_Length(geom::geography)) AS length_m
     FROM road_segments
     WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
       AND ST_Intersects(geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))
       AND COALESCE(length_m, ST_Length(geom::geography)) >= 40
     ORDER BY id`,
    [BBOX.west, BBOX.south, BBOX.east, BBOX.north]
  );
  return result.rows.map((row) => ({ ...row, length_m: Number(row.length_m) }));
}

// Build the list of pothole plans (segment + status) following the requested distribution
function buildPlans(segments) {
  const named = shuffle(segments.filter((segment) => segment.name));
  const unnamed = shuffle(segments.filter((segment) => !segment.name));
  const pool = [...named, ...unnamed];
  const used = new Set();
  const take = (segment) => { used.add(segment.id); return segment; };
  const available = () => pool.filter((segment) => !used.has(segment.id));

  const plans = [];
  const add = (segment, status, group) => plans.push({ segmentId: segment.id, status, group });

  // One road with only repaired potholes -> no color
  const byName = new Map();
  for (const segment of named) byName.set(segment.name, [...(byName.get(segment.name) || []), segment]);
  const doneRoad = [...byName.values()].sort((a, b) => b.length - a.length)[0] || [pool[0]];
  const doneSegments = shuffle(doneRoad).slice(0, 3).map(take);
  const doneHoles = [3, 3, 2];
  doneSegments.forEach((segment, index) => {
    for (let i = 0; i < doneHoles[index]; i += 1) add(segment, 'repaired', 'done');
  });

  // Clusters -> red
  const redCandidates = available().filter((segment) => Math.ceil(effectiveLength(segment) / HEATMAP_CONFIG.SEVERE_MAX_M_PER_HOLE) <= 6);
  const redSegments = redCandidates.slice(0, randInt(6, 8)).map(take);
  for (const segment of redSegments) {
    const minHoles = Math.ceil(effectiveLength(segment) / HEATMAP_CONFIG.SEVERE_MAX_M_PER_HOLE);
    const holes = Math.min(6, Math.max(3, minHoles) + randInt(0, 1));
    for (let i = 0; i < holes; i += 1) add(segment, 'active', 'red');
    if (rng() < 0.5) add(segment, pick(NON_ACTIVE), 'red');
  }

  // 1-2 holes -> yellow, mix of long and short segments
  const bySize = available().sort((a, b) => b.length_m - a.length_m);
  const yellowCount = randInt(10, 14);
  const longOnes = bySize.slice(0, Math.ceil(yellowCount / 2));
  const shortOnes = bySize.slice(-Math.floor(yellowCount / 2));
  for (const segment of [...longOnes, ...shortOnes]) {
    take(segment);
    const holes = rng() < 0.5 ? 1 : 2;
    for (let i = 0; i < holes; i += 1) add(segment, 'active', 'yellow');
    if (rng() < 0.25) add(segment, pick(NON_ACTIVE), 'yellow');
  }

  // Off-road points are generated separately; reserve their slots
  const offRoad = 3;
  const remaining = Math.max(TOTAL_POTHOLES - plans.length - offRoad, 0);
  const counts = { active: 0, in_progress: 0, repaired: 0 };
  for (const plan of plans) counts[plan.status] += 1;
  counts.active += offRoad;

  const rest = shuffle(available());
  for (let i = 0; i < remaining; i += 1) {
    const deficits = Object.entries(STATUS_TARGET_SHARE)
      .map(([status, share]) => [status, share * TOTAL_POTHOLES - counts[status]])
      .sort((a, b) => b[1] - a[1]);
    const status = deficits[0][0];
    counts[status] += 1;
    add(rest[i % Math.max(rest.length, 1)] || pool[i % pool.length], status, 'rest');
  }

  return { plans, offRoad };
}

// Stratified positions along a segment so potholes on one segment do not stack
function fractionsFor(count) {
  return Array.from({ length: count }, (_, index) => 0.1 + 0.8 * ((index + 0.2 + 0.6 * rng()) / count));
}

function addNoise(lat, lon) {
  const distance = 2 + 2 * rng();
  const angle = rng() * 2 * Math.PI;
  return {
    lat: lat + (distance * Math.sin(angle)) / 111320,
    lon: lon + (distance * Math.cos(angle)) / (111320 * Math.cos((lat * Math.PI) / 180)),
  };
}

async function placeOnSegment(segmentId, fraction) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const t = Math.min(0.95, Math.max(0.05, fraction + (attempt ? (rng() - 0.5) * 0.2 : 0)));
    const point = await pool.query(
      `SELECT ST_Y(pt) AS lat, ST_X(pt) AS lon
       FROM (SELECT ST_LineInterpolatePoint(geom, $2) AS pt FROM road_segments WHERE id = $1) AS p`,
      [segmentId, t]
    );
    if (!point.rows[0]) return null;
    const noisy = addNoise(point.rows[0].lat, point.rows[0].lon);
    const snapped = await findNearestRoadSegment(noisy.lat, noisy.lon);
    if (snapped && (snapped.id === segmentId || attempt === 7)) return { ...noisy, segment: snapped };
  }
  return null;
}

async function findOffRoadPoint() {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const lon = BBOX.west + rng() * (BBOX.east - BBOX.west);
    const lat = BBOX.south + rng() * (BBOX.north - BBOX.south);
    const result = await pool.query(
      `SELECT NOT EXISTS (
         SELECT 1 FROM road_segments
         WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 40)
       ) AS off_road`,
      [lon, lat]
    );
    if (result.rows[0].off_road) return { lat, lon };
  }
  return null;
}

function buildTimeline(status) {
  const firstMaxDays = status === 'repaired' ? 85 : 90;
  const first = new Date(REFERENCE_DATE.getTime() - (randInt(status === 'repaired' ? 6 : 1, firstMaxDays) + rng()) * DAY_MS);
  const spanMs = REFERENCE_DATE.getTime() - first.getTime();
  const detectedLast = new Date(first.getTime() + rng() * spanMs * 0.7);

  if (status === 'repaired') {
    const repaired = new Date(Math.min(first.getTime() + randInt(3, 40) * DAY_MS, REFERENCE_DATE.getTime() - DAY_MS));
    return { first, last: new Date(Math.min(detectedLast.getTime(), repaired.getTime())), repaired, updated: repaired };
  }
  if (status === 'in_progress') {
    const updated = new Date(Math.min(detectedLast.getTime() + randInt(1, 10) * DAY_MS, REFERENCE_DATE.getTime()));
    return { first, last: detectedLast, repaired: null, updated };
  }
  return { first, last: detectedLast, repaired: null, updated: detectedLast };
}

async function insertPothole({ lat, lon, status, segment }) {
  const timeline = buildTimeline(status);
  const methods = rng() < 0.6 ? ['camera', 'imu'] : [pick(['camera', 'imu'])];
  await pool.query(
    `INSERT INTO potholes
       (lat, lon, report_count, status, first_detected_at, last_detected_at, repaired_at,
        updated_at, validation_methods, location_name, segment_id, needs_review, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, 'seed')`,
    [
      lat, lon, randInt(1, 8), status, timeline.first, timeline.last, timeline.repaired,
      timeline.updated, JSON.stringify(methods), segment?.name ?? null, segment?.id ?? null, !segment,
    ]
  );
}

async function printSummary() {
  const result = await pool.query(
    `SELECT s.id, s.name, COALESCE(s.length_m, ST_Length(s.geom::geography)) AS length_m,
            COUNT(p.id) FILTER (WHERE LOWER(COALESCE(p.status, '')) NOT IN ('repaired', 'selesai'))::integer AS holes
     FROM road_segments AS s
     LEFT JOIN potholes AS p ON p.segment_id = s.id
     WHERE s.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
     GROUP BY s.id`,
    [BBOX.west, BBOX.south, BBOX.east, BBOX.north]
  );

  const colored = [];
  let uncolored = 0;
  for (const row of result.rows) {
    const { lengthPerHole, level } = classifySegment(Number(row.length_m), row.holes, HEATMAP_CONFIG);
    if (level) colored.push({ ...row, lengthPerHole, level });
    else uncolored += 1;
  }

  console.log(`Segments in bbox: ${result.rowCount}`);
  console.log(`Red (severe): ${colored.filter((row) => row.level === 'severe').length}`);
  console.log(`Yellow (mid): ${colored.filter((row) => row.level === 'mid').length}`);
  console.log(`Uncolored: ${uncolored}`);
  console.log('5 segments with the lowest length_per_hole_m:');
  colored
    .sort((a, b) => a.lengthPerHole - b.lengthPerHole)
    .slice(0, 5)
    .forEach((row) => console.log(`  #${row.id} ${row.name || '(tanpa nama)'}: ${row.lengthPerHole.toFixed(1)} m/lubang (${row.holes} lubang)`));
}

async function seedPotholes() {
  await initDb();
  if (!isPgConnected()) throw new Error('PostgreSQL/PostGIS is unavailable; seeding requires persistent storage.');

  const removed = await clearSeed();
  if (removed) console.log(`Removed ${removed} previous seed potholes.`);

  const segments = await loadSegments();
  if (segments.length < 40) {
    throw new Error(`Only ${segments.length} road segments found in the UGM bbox. Run "npm run import-roads" first.`);
  }

  const { plans, offRoad } = buildPlans(segments);
  const bySegment = new Map();
  for (const plan of plans) bySegment.set(plan.segmentId, [...(bySegment.get(plan.segmentId) || []), plan]);

  let inserted = 0;
  let skipped = 0;
  for (const [segmentId, group] of bySegment) {
    const fractions = fractionsFor(group.length);
    for (let i = 0; i < group.length; i += 1) {
      const placed = await placeOnSegment(segmentId, fractions[i]);
      if (!placed) { skipped += 1; continue; }
      await insertPothole({ lat: placed.lat, lon: placed.lon, status: group[i].status, segment: placed.segment });
      inserted += 1;
    }
  }

  let offRoadInserted = 0;
  for (let i = 0; i < offRoad; i += 1) {
    const point = await findOffRoadPoint();
    if (!point) continue;
    await insertPothole({ ...point, status: 'active', segment: null });
    offRoadInserted += 1;
  }

  invalidateRoadHeatCache();
  await rebuildStreetPins();
  console.log(`Seeded ${inserted} on-road potholes (${skipped} skipped) and ${offRoadInserted} off-road (needs_review).`);
  await printSummary();
}

if (require.main === module) {
  const run = process.argv.includes('--clear')
    ? async () => {
      await initDb();
      if (!isPgConnected()) throw new Error('PostgreSQL is unavailable.');
      console.log(`Deleted ${await clearSeed()} seed potholes.`);
    }
    : seedPotholes;

  run()
    .catch((error) => {
      console.error(`[Seed] ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { seedPotholes, clearSeed };
