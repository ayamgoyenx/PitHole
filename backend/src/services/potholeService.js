const { query, withTransaction, isPgConnected, memoryDb } = require('../db');
const { getHaversineDistance } = require('../utils/haversine');
const { findNearestRoadSegment, invalidateRoadHeatCache } = require('./roadService');
const { reverseGeocode } = require('./geocoding');
const { syncPothole, rebuildAll } = require('./streetPinService');

const { validTimestamp } = require('../utils/timestamps');

const DEDUPLICATION_RADIUS_METERS = 5.0;

async function resolveLocationMetadata(lat, lon, runQuery) {
  let segment = null;
  try {
    segment = await findNearestRoadSegment(lat, lon, runQuery);
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
 * Processing batch data upload from ESP32 MicroSD with deduplication spatially
 */
async function processBatchUpload(syncTime, potholes) {
  // Validate the entire batch before writing anything, including the DB key limit.
  for (const item of potholes) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw Object.assign(new Error('Setiap pothole harus berupa object.'), { statusCode: 400 });
    }
    if (item.event_id != null && (typeof item.event_id !== 'string'
        || !item.event_id.trim() || Array.from(item.event_id).length > 80)) {
      throw Object.assign(new Error('event_id harus string berisi 1-80 karakter.'), { statusCode: 400 });
    }
    if (item.event_id) {
      if (!isPgConnected()) {
        throw Object.assign(new Error('Database belum siap. Simpan antrean dan kirim ulang event yang sama.'), { statusCode: 503 });
      }
      const lat = Number(item.lat), lon = Number(item.lon);
      if (item.lat == null || item.lon == null || String(item.lat).trim() === '' || String(item.lon).trim() === ''
          || !['string', 'number'].includes(typeof item.lat) || !['string', 'number'].includes(typeof item.lon)
          || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        throw Object.assign(new Error('Koordinat event tidak valid.'), { statusCode: 400 });
      }
      const timestamp = item.detected_at ?? syncTime;
      if (timestamp != null && !validTimestamp(timestamp)) {
        throw Object.assign(new Error('Waktu deteksi event tidak valid.'), { statusCode: 400 });
      }
    }
  }
  const processedResults = [];

  for (const item of potholes) {
    const lat = item.event_id ? Number(item.lat) : parseFloat(item.lat);
    const lon = item.event_id ? Number(item.lon) : parseFloat(item.lon);
    const detectedAt = item.detected_at || syncTime || new Date().toISOString();
    const eventId = item.event_id || null;

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      continue;
    }

    if (isPgConnected()) {
      const result = await withTransaction(async (tx) => {
        // Serialize the spatial match+insert decision across concurrent ingestion.
        // One lock is intentionally conservative for the current small device fleet.
        await tx('SELECT pg_advisory_xact_lock(73190421)');
        if (eventId) {
          const claim = await tx(
            'INSERT INTO pothole_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_id',
            [eventId]
          );
          if (claim.rows.length === 0) {
            const existing = await tx('SELECT pothole_id FROM pothole_events WHERE event_id = $1', [eventId]);
            return { action: 'duplicate', event_id: eventId, pothole_id: existing.rows[0].pothole_id };
          }
        }

        const point = 'ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography';
        const matchResult = await tx(
          `SELECT *, ST_Distance(ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography, ${point}) AS distance_m
           FROM potholes
           WHERE status IN ('active', 'in_progress')
             AND ST_DWithin(ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography, ${point}, $3)
           ORDER BY distance_m LIMIT 1 FOR UPDATE`,
          [lat, lon, DEDUPLICATION_RADIUS_METERS]
        );
        const match = matchResult.rows[0];
        let outcome;
        if (match) {
          const updated = await tx(
            `UPDATE potholes
             SET report_count = COALESCE(report_count, 1) + 1,
                 first_detected_at = LEAST(first_detected_at, $1::timestamptz),
                 last_detected_at = GREATEST(last_detected_at, $1::timestamptz), updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 RETURNING *`,
            [detectedAt, match.id]
          );
          outcome = { action: 'updated', pothole: updated.rows[0], distance: Number(match.distance_m) };
        } else {
          const location = await resolveLocationMetadata(lat, lon, tx);
          const inserted = await tx(
            `INSERT INTO potholes
               (lat, lon, report_count, status, first_detected_at, last_detected_at,
                repaired_at, updated_at, validation_methods, location_name, segment_id, needs_review)
             VALUES ($1, $2, 1, 'active', $3, $3, NULL, CURRENT_TIMESTAMP, $4, NULL, $5, $6)
             RETURNING *`,
            [lat, lon, detectedAt, JSON.stringify(['camera', 'imu']), location.segmentId, location.needsReview]
          );
          outcome = { action: 'created', pothole: inserted.rows[0], location };
        }
        if (eventId) {
          await tx('UPDATE pothole_events SET pothole_id = $2 WHERE event_id = $1', [eventId, outcome.pothole.id]);
        }
        return outcome;
      });

      
      // A retry after any post-commit failure still finds the committed event.
      if (result.action !== 'duplicate') {
        invalidateRoadHeatCache();
        if (result.action === 'created') {
          try {
            const locationName = await reverseGeocode(lat, lon, result.location.segmentName);
            if (locationName) {
              const named = await query('UPDATE potholes SET location_name = $1 WHERE id = $2 RETURNING *',
                [locationName, result.pothole.id]);
              result.pothole = named.rows[0] || result.pothole;
            }
          } catch (error) {
            console.warn(`[Geocoding] Pothole ${result.pothole.id} saved without a location name: ${error.message}`);
          }
        }
        await syncPothole(result.pothole.id, lat, lon, result.location ? {
          idLocation: result.location.segmentId,
          locationName: result.pothole.location_name || result.location.segmentName || null,
        } : undefined);
        delete result.location;
      }
      processedResults.push(result);
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


async function getSyncSnapshot(lastSync) {
  if (lastSync != null && !validTimestamp(lastSync)) {
    throw Object.assign(new Error('last_sync tidak valid'), { statusCode: 400 });
  }
  return withTransaction(async tx => {
    await tx('LOCK TABLE potholes IN SHARE MODE');
    const clock = await tx("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') AS watermark");
    const rows = await tx(`SELECT * FROM potholes ${lastSync ? 'WHERE updated_at >= $1' : ''} ORDER BY updated_at, id`, lastSync ? [lastSync] : []);
    return { potholes: rows.rows, sync_time: clock.rows[0].watermark };
  });
}


// Mendapatkan data titik lubang baru setelah timestamp last_sync
async function getSyncData(lastSync) {
  if (lastSync != null && !validTimestamp(lastSync)) {
    throw Object.assign(new Error('last_sync tidak valid'), { statusCode: 400 });
  }
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

// Mendapatkan seluruh daftar potholes untuk frontend React
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

// Mendapatkan 1 pothole berdasarkan ID
async function getPotholeById(id) {
  if (isPgConnected()) {
    const res = await query(`${POTHOLE_WITH_STREET_SQL} WHERE p.id = $1`, [id]);
    return res.rows[0] || null;
  } else {
    return memoryDb.potholes.find((p) => p.id === parseInt(id, 10)) || null;
  }
}

// Mengubah status pothole oleh Admin
async function updatePotholeStatus(id, status) {
  const validStatuses = ['active', 'in_progress', 'repaired'];
  if (!validStatuses.includes(status)) {
    throw Object.assign(new Error('Status tidak valid'), { statusCode: 400 });
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

// Untuk pothole yang diinput manual / tanpa segment: cari segment terdekat (25 m),
// lalu isi location_name (nama segment, atau reverse geocode) jika masih kosong.

async function fillMissingLocationMetadata() {
  if (!isPgConnected()) return 0;
  const rows = (await query(
    `SELECT id, lat, lon, location_name, segment_id, needs_review FROM potholes
     WHERE segment_id IS NULL OR NULLIF(BTRIM(location_name), '') IS NULL`
  )).rows;

  let touched = 0;
  for (const row of rows) {
    const location = await resolveLocationMetadata(row.lat, row.lon);
    let name = row.location_name?.trim() || location.segmentName;
    if (!name) {
      try {
        name = await reverseGeocode(row.lat, row.lon, null);
      } catch (error) {
        console.warn(`[Geocoding] Pothole ${row.id}: ${error.message}`);
      }
    }
    const segmentId = location.segmentId ?? row.segment_id;
    const needsReview = segmentId == null;
    if (segmentId === row.segment_id && needsReview === row.needs_review
        && (name || null) === row.location_name) continue;
    await query(
      `UPDATE potholes SET segment_id = $1, needs_review = $2, location_name = $3,
       updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
      [segmentId, needsReview, name || null, row.id]
    );
    touched++;
  }
  if (touched) invalidateRoadHeatCache();
  console.log(`[Geocoding] Location backfill: ${rows.length} checked, ${touched} updated.`);
  return touched;
}

module.exports = {
  processBatchUpload,
  getSyncData,
  getSyncSnapshot,
  getAllPotholes,
  getPotholeById,
  updatePotholeStatus,
  fillMissingLocationMetadata,
};
