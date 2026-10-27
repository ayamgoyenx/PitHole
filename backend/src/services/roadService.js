const { query, isPgConnected } = require('../db');
const { HEATMAP_CONFIG } = require('../config/heatmap');
const { classifySegment } = require('../utils/classifySegment');

const ROAD_SNAP_RADIUS_METERS = 25;
const ROAD_HEAT_CACHE_MS = 45000;

let heatCache = null;

function emptyFeatureCollection(available = false) {
  return {
    type: 'FeatureCollection',
    available,
    meta: { config: HEATMAP_CONFIG },
    features: [],
  };
}

const round1 = (value) => Math.round(value * 10) / 10;
async function findNearestRoadSegment(lat, lon) {
  if (!isPgConnected() || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) {
    return null;
  }

  const point = 'ST_SetSRID(ST_MakePoint($2, $1), 4326)';
  const result = await query(
    `SELECT id, name
     FROM road_segments
     WHERE ST_DWithin(geom::geography, ${point}::geography, $3)
     ORDER BY geom <-> ${point}
     LIMIT 1`,
    [Number(lat), Number(lon), ROAD_SNAP_RADIUS_METERS]
  );

  return result.rows[0] || null;
}

async function getRoadHeatGeoJSON() {
  if (!isPgConnected()) return emptyFeatureCollection(false);
  if (heatCache && heatCache.expiresAt > Date.now()) return heatCache.data;

  const result = await query(
    `SELECT
       segment.id AS segment_id,
       segment.name,
       COALESCE(segment.length_m, ST_Length(segment.geom::geography)) AS length_m,
       COUNT(*)::integer AS holes,
       ST_AsGeoJSON(segment.geom)::json AS geometry
     FROM road_segments AS segment
     JOIN potholes AS pothole ON pothole.segment_id = segment.id
     WHERE LOWER(COALESCE(pothole.status, '')) NOT IN ('repaired', 'selesai')
       AND segment.geom IS NOT NULL
     GROUP BY segment.id, segment.name, segment.length_m, segment.geom`
  );

  const features = [];
  for (const row of result.rows) {
    const { lengthPerHole, level } = classifySegment(row.length_m, row.holes, HEATMAP_CONFIG);
    if (!level) continue;
    features.push({
      type: 'Feature',
      geometry: typeof row.geometry === 'string' ? JSON.parse(row.geometry) : row.geometry,
      properties: {
        segment_id: row.segment_id,
        name: row.name,
        length_m: round1(Number(row.length_m)),
        holes: row.holes,
        length_per_hole_m: round1(lengthPerHole),
        level,
      },
    });
  }

  const data = { type: 'FeatureCollection', available: true, meta: { config: HEATMAP_CONFIG }, features };
  heatCache = { data, expiresAt: Date.now() + ROAD_HEAT_CACHE_MS };
  return data;
}

// Re-snap every pothole to its nearest segment (used after a road re-import).
async function resnapAllPotholes() {
  const result = await query(
    `UPDATE potholes AS p
     SET segment_id = nearest.id,
         location_name = COALESCE(nearest.name, p.location_name),
         needs_review = (nearest.id IS NULL)
     FROM potholes AS src
     LEFT JOIN LATERAL (
       SELECT s.id, s.name
       FROM road_segments AS s
       WHERE ST_DWithin(s.geom::geography, ST_SetSRID(ST_MakePoint(src.lon, src.lat), 4326)::geography, $1)
       ORDER BY s.geom <-> ST_SetSRID(ST_MakePoint(src.lon, src.lat), 4326)
       LIMIT 1
     ) AS nearest ON TRUE
     WHERE p.id = src.id`,
    [ROAD_SNAP_RADIUS_METERS]
  );
  invalidateRoadHeatCache();
  return result.rowCount;
}
function invalidateRoadHeatCache() {
  heatCache = null;
}

module.exports = {
  ROAD_SNAP_RADIUS_METERS,
  findNearestRoadSegment,
  getRoadHeatGeoJSON,
  resnapAllPotholes,
  invalidateRoadHeatCache,
};
