const { query, isPgConnected, memoryDb } = require('../db');
const { getHaversineDistance } = require('../utils/haversine');
const { findNearestRoadSegment, invalidateRoadHeatCache } = require('./roadService');
const { reverseGeocode } = require('./geocoding');
const { syncPothole, rebuildAll } = require('./streetPinService');

const DEDUPLICATION_RADIUS_METERS = 5.0;

async function resolveLocationMetadata(lat, lon) {
  let segment = null;
  try {
    segment = await findNearestRoadSegment(lat, lon);
  } catch (error) {
    console.warn(`[Road snap] Could not find a nearby segment: ${error.message}`);
  }

  return {
    segmentId: segment?.id ?? null,
    segmentName: segment?.name ?? null,
    needsReview: !segment,
  };
}

/**
 * Memproses batch data upload dari ESP32 MicroSD dengan deduplikasi spasial
 */
async function processBatchUpload(syncTime, potholes) {
  const processedResults = [];

  for (const item of potholes) {
    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);
    const detectedAt = item.detected_at || syncTime || new Date().toISOString();

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      continue;
    }

    if (isPgConnected()) {
      const point = 'ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography';
      const matchResult = await query(
        `SELECT *, ST_Distance(ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography, ${point}) AS distance_m
         FROM potholes
         WHERE status = 'active'
           AND ST_DWithin(ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography, ${point}, $3)
         ORDER BY distance_m
         LIMIT 1`,
        [lat, lon, DEDUPLICATION_RADIUS_METERS]
      );
      const match = matchResult.rows[0];
      if (match) {
        const updateRes = await query(
          `UPDATE potholes
           SET report_count = COALESCE(report_count, 1) + 1,
               last_detected_at = $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2
           RETURNING *`,
          [detectedAt, match.id]
        );
        await syncPothole(match.id, lat, lon);
        processedResults.push({ action: 'updated', pothole: updateRes.rows[0], distance: Number(match.distance_m) });
      } else {
        const location = await resolveLocationMetadata(lat, lon);
        const insertRes = await query(
          `INSERT INTO potholes
             (lat, lon, report_count, status, first_detected_at, last_detected_at,
              repaired_at, updated_at, validation_methods, location_name, segment_id, needs_review)
           VALUES ($1, $2, 1, 'active', $3, $3, NULL, CURRENT_TIMESTAMP, $4, NULL, $5, $6)
           RETURNING *`,
          [lat, lon, detectedAt, JSON.stringify(['camera', 'imu']), location.segmentId, location.needsReview]
        );
        let pothole = insertRes.rows[0];
        try {
          const locationName = await reverseGeocode(lat, lon, location.segmentName);
          if (locationName) {
            const named = await query(
              'UPDATE potholes SET location_name = $1 WHERE id = $2 RETURNING *',
              [locationName, pothole.id]
            );
            pothole = named.rows[0] || pothole;
          }
        } catch (error) {
          console.warn(`[Geocoding] Pothole ${pothole.id} saved without a location name: ${error.message}`);
        }
        await syncPothole(pothole.id, lat, lon, {
          idLocation: location.segmentId,
          locationName: pothole.location_name || location.segmentName || null,
        });
        processedResults.push({ action: 'created', pothole });
      }
    } else {
      // Mode In-Memory Fallback
      let match = null;
      let minDistance = Infinity;

      for (const existing of memoryDb.potholes) {
        if (existing.status !== 'active') continue;
        const dist = getHaversineDistance(lat, lon, existing.lat, existing.lon);
        if (dist <= DEDUPLICATION_RADIUS_METERS && dist < minDistance) {
          minDistance = dist;
          match = existing;
        }
      }

      if (match) {
        match.report_count = (match.report_count || 1) + 1;
        match.last_detected_at = detectedAt;
        match.updated_at = new Date().toISOString();
        processedResults.push({ action: 'updated', pothole: match, distance: minDistance });
      } else {
        const location = await resolveLocationMetadata(lat, lon);
        const newPothole = {
          id: memoryDb.nextId++,
          lat,
          lon,
          report_count: 1,
          status: 'active',
          first_detected_at: detectedAt,
          last_detected_at: detectedAt,
          repaired_at: null,
          location_name: null,
          segment_id: location.segmentId,
          needs_review: location.needsReview,
          updated_at: new Date().toISOString(),
          validation_methods: ['camera', 'imu'],
        };
        memoryDb.potholes.push(newPothole);
        try {
          newPothole.location_name = await reverseGeocode(lat, lon, location.segmentName);
        } catch (error) {
          console.warn(`[Geocoding] Pothole ${newPothole.id} saved without a location name: ${error.message}`);
        }
        processedResults.push({ action: 'created', pothole: newPothole });
      }
    }
  }

  if (processedResults.length) invalidateRoadHeatCache();
  return processedResults;
}

/**
 * Mendapatkan data titik lubang baru setelah timestamp last_sync
 */
async function getSyncData(lastSync) {
  if (isPgConnected()) {
    let sql = 'SELECT * FROM potholes';
    const params = [];

    if (lastSync) {
      sql += ' WHERE updated_at > $1';
      params.push(new Date(lastSync).toISOString());
    }
    sql += ' ORDER BY updated_at ASC';

    const res = await query(sql, params);
    return res.rows;
  } else {
    if (!lastSync) return memoryDb.potholes;
    const syncDate = new Date(lastSync);
    return memoryDb.potholes.filter((p) => new Date(p.updated_at) > syncDate);
  }
}

/**
 * Mendapatkan seluruh daftar potholes untuk frontend React
 */
const POTHOLE_WITH_STREET_SQL = `SELECT p.*, rs.name AS street_name
  FROM potholes p LEFT JOIN road_segments rs ON rs.id = p.segment_id`;

async function getAllPotholes() {
  if (isPgConnected()) {
    const res = await query(`${POTHOLE_WITH_STREET_SQL} ORDER BY p.id DESC`);
    return res.rows;
  } else {
    return [...memoryDb.potholes].sort((a, b) => b.id - a.id);
  }
}

/**
 * Mendapatkan 1 pothole berdasarkan ID
 */
async function getPotholeById(id) {
  if (isPgConnected()) {
    const res = await query(`${POTHOLE_WITH_STREET_SQL} WHERE p.id = $1`, [id]);
    return res.rows[0] || null;
  } else {
    return memoryDb.potholes.find((p) => p.id === parseInt(id, 10)) || null;
  }
}

/**
 * Mengubah status pothole oleh Admin
 */
async function updatePotholeStatus(id, status) {
  const validStatuses = ['active', 'in_progress', 'repaired'];
  if (!validStatuses.includes(status)) {
    throw new Error('Status tidak valid');
  }

  if (isPgConnected()) {
    const res = await query(
      `UPDATE potholes
       SET status = $1::varchar,
           repaired_at = CASE
             WHEN $1::varchar = 'repaired' AND status <> 'repaired' THEN CURRENT_TIMESTAMP
             WHEN $1::varchar = 'repaired' THEN repaired_at
             ELSE NULL
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );
    if (!res.rows[0]) return null;
    await syncPothole(res.rows[0].id, res.rows[0].lat, res.rows[0].lon);
    invalidateRoadHeatCache();
    return getPotholeById(id);
  } else {
    const pothole = memoryDb.potholes.find((p) => p.id === parseInt(id, 10));
    if (pothole) {
      if (status === 'repaired' && pothole.status !== 'repaired') {
        pothole.repaired_at = new Date().toISOString();
      } else if (status !== 'repaired') {
        pothole.repaired_at = null;
      }
      pothole.status = status;
      pothole.updated_at = new Date().toISOString();
      invalidateRoadHeatCache();
      return pothole;
    }
    return null;
  }
}

/**
 * Seed data awal area UGM
 */
async function seedInitialPotholes() {
  const seedPotholes = [
    {
      id: 1,
      lat: -7.7715,
      lon: 110.3775,
      report_count: 3,
      status: 'repaired',
      first_detected_at: '2026-05-01T08:00:00Z',
      last_detected_at: '2026-05-01T08:00:00Z',
      repaired_at: null,
      validation_methods: ['camera', 'imu'],
    },
    {
      id: 2,
      lat: -7.7685,
      lon: 110.3792,
      report_count: 5,
      status: 'active',
      first_detected_at: '2026-05-07T14:23:15Z',
      last_detected_at: '2026-05-07T14:23:15Z',
      repaired_at: null,
      validation_methods: ['camera', 'imu'],
    },
    {
      id: 3,
      lat: -7.7702,
      lon: 110.3768,
      report_count: 2,
      status: 'active',
      first_detected_at: '2026-05-08T09:10:00Z',
      last_detected_at: '2026-05-08T09:10:00Z',
      repaired_at: null,
      validation_methods: ['camera', 'imu'],
    },
    {
      id: 4,
      lat: -7.7698,
      lon: 110.3745,
      report_count: 8,
      status: 'in_progress',
      first_detected_at: '2026-05-09T11:45:00Z',
      last_detected_at: '2026-05-09T11:45:00Z',
      repaired_at: null,
      validation_methods: ['camera', 'imu'],
    },
    {
      id: 5,
      lat: -7.7710,
      lon: 110.3760,
      report_count: 12,
      status: 'active',
      first_detected_at: '2026-05-10T16:00:00Z',
      last_detected_at: '2026-05-10T16:00:00Z',
      repaired_at: null,
      validation_methods: ['camera', 'imu'],
    },
  ];

  if (isPgConnected()) {
    // Clear & seed PostgreSQL table
    await query('TRUNCATE TABLE potholes RESTART IDENTITY CASCADE');
    for (const p of seedPotholes) {
      await query(
        `INSERT INTO potholes (lat, lon, report_count, status, first_detected_at, last_detected_at, updated_at, validation_methods)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7)`,
        [p.lat, p.lon, p.report_count, p.status, p.first_detected_at, p.last_detected_at, JSON.stringify(p.validation_methods)]
      );
    }
  } else {
    memoryDb.potholes = seedPotholes.map((p) => ({
      ...p,
      updated_at: new Date().toISOString(),
    }));
    memoryDb.nextId = 6;
  }

  await fillMissingLocationMetadata();
  try {
    await rebuildAll();
  } catch (error) {
    console.warn(`[Street pin] Rebuild skipped (run npm run migrate): ${error.message}`);
  }
  invalidateRoadHeatCache();
  return seedPotholes;
}

/**
 * Untuk pothole yang diinput manual / tanpa segment: cari segment terdekat (25 m),
 * lalu isi location_name (nama segment, atau reverse geocode) jika masih kosong.
 */
async function fillMissingLocationMetadata() {
  if (!isPgConnected()) return 0;
  const rows = (await query(
    `SELECT id, lat, lon, location_name FROM potholes
     WHERE segment_id IS NULL OR location_name IS NULL`
  )).rows;

  let touched = 0;
  for (const row of rows) {
    const location = await resolveLocationMetadata(row.lat, row.lon);
    let name = row.location_name || location.segmentName;
    if (!name) {
      try {
        name = await reverseGeocode(row.lat, row.lon, null);
      } catch (error) {
        console.warn(`[Geocoding] Pothole ${row.id}: ${error.message}`);
      }
    }
    await query(
      'UPDATE potholes SET segment_id = $1, needs_review = $2, location_name = $3 WHERE id = $4',
      [location.segmentId, location.needsReview, name || null, row.id]
    );
    touched++;
  }
  if (touched) invalidateRoadHeatCache();
  return touched;
}

module.exports = {
  processBatchUpload,
  getSyncData,
  getAllPotholes,
  getPotholeById,
  updatePotholeStatus,
  seedInitialPotholes,
  fillMissingLocationMetadata,
};
