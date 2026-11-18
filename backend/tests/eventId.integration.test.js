const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Opt-in only. Uses a dedicated local test cluster, never .env or DB_URL.
const port = process.env.PITHOLE_EVENT_TEST_PORT;
test('event ingestion transactions (isolated PostgreSQL/PostGIS)', { skip: !port }, async (t) => {
  const { Pool } = require('pg');
  const config = { host: '127.0.0.1', port: Number(port), user: process.env.PITHOLE_EVENT_TEST_USER || 'pithole_test', database: 'postgres' };
  const admin = new Pool(config);
  const schema = `event_test_${process.pid}_${Date.now()}`;
  let pool;
  try {
    await admin.query('CREATE EXTENSION IF NOT EXISTS postgis');
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ ...config, max: 12, options: `-c search_path=${schema},public` });
    function load(relative, deps) {
      const filename = path.join(__dirname, '..', relative);
      const context = { module: { exports: {} }, require: (name) => {
        if (!(name in deps)) throw new Error(`Unexpected dependency ${name}`);
        return deps[name];
      }, process: { env: {} }, console };
      const source = fs.readFileSync(filename, 'utf8').replace(/CREATE TABLE IF NOT EXISTS (\w+)/g, `CREATE TABLE IF NOT EXISTS ${schema}.$1`);
      vm.runInNewContext(source, context, { filename });
      return context.module.exports;
    }
    const db = load('src/db.js', { pg: { Pool: function () { return pool; } }, dotenv: { config() {} }, './config/database': { databaseConfig: () => ({}) } });
    await db.initDb();
    assert.equal(db.isPgConnected(), true);
    await pool.query(`ALTER TABLE potholes ADD COLUMN location_name TEXT,
      ADD COLUMN segment_id INTEGER, ADD COLUMN needs_review BOOLEAN DEFAULT FALSE`);
    await pool.query(fs.readFileSync(path.join(__dirname, '../migrations/006_sync_write_clock.sql'), 'utf8'));
    let failPostCommit = false;
    const service = load('src/services/potholeService.js', {
      '../db': db,
      '../utils/timestamps': require('../src/utils/timestamps'),
      '../utils/haversine': require('../src/utils/haversine'),
      './roadService': { findNearestRoadSegment: async () => null, invalidateRoadHeatCache() {} },
      './geocoding': { reverseGeocode: async () => null },
      './streetPinService': { syncPothole: async () => {
        if (failPostCommit) throw new Error('simulated response/post-commit failure');
      }, rebuildAll: async () => {} },
    });
    const event = { event_id: 'SEPEDA01-2026-11-17-01:00:00--7770000-110370000',
      lat: -7.77, lon: 110.37, detected_at: '2026-11-17T01:00:00Z' };
    const upload = (items = [event]) => service.processBatchUpload(null, items);
    const reset = async () => { failPostCommit = false; await pool.query('TRUNCATE pothole_events, potholes RESTART IDENTITY'); };
    const counts = async () => (await pool.query(`SELECT
      (SELECT count(*)::int FROM potholes) AS holes,
      (SELECT count(*)::int FROM pothole_events) AS events,
      (SELECT coalesce(sum(report_count),0)::int FROM potholes) AS reports`)).rows[0];

    await t.test('sync does not lose a later write from an older transaction', async () => {
      await reset(); await upload();
      const writer = await pool.connect();
      try {
        await writer.query('BEGIN');
        await writer.query('SELECT pg_sleep(0.02)');
        const first = await service.getSyncSnapshot();
        assert.equal(first.potholes.length, 1);
        await writer.query("UPDATE potholes SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP");
        await writer.query('COMMIT');
        const next = await service.getSyncSnapshot(first.sync_time);
        assert.equal(next.potholes.length, 1);
        assert.equal(next.potholes[0].status, 'in_progress');
      } finally { await writer.query('ROLLBACK'); writer.release(); }
    });
    await t.test('sync snapshot includes an in-flight writer before advancing its watermark', async () => {
      await reset(); await upload();
      const writer = await pool.connect();
      try {
        await writer.query('BEGIN');
        await writer.query("UPDATE potholes SET status = 'repaired'");
        const snapshot = service.getSyncSnapshot();
        await writer.query('COMMIT');
        assert.equal((await snapshot).potholes[0].status, 'repaired');
      } finally { await writer.query('ROLLBACK'); writer.release(); }
    });

    await t.test('12 concurrent retries create one pothole and one report', async () => {
      await reset();
      const results = (await Promise.all(Array.from({ length: 12 }, () => upload()))).flat();
      assert.equal(results.filter(r => r.action === 'created').length, 1);
      assert.equal(results.filter(r => r.action === 'duplicate').length, 11);
      assert.deepEqual(await counts(), { holes: 1, events: 1, reports: 1 });
      assert.ok(results.filter(r => r.action === 'duplicate').every(r => r.pothole_id === 1));
    });
    await t.test('different concurrent events at the same location share one pothole', async () => {
      await reset();
      await Promise.all(Array.from({ length: 8 }, (_, i) => upload([{ ...event, event_id: `distinct-${i}` }])));
      assert.deepEqual(await counts(), { holes: 1, events: 8, reports: 8 });
    });
    await t.test('late uploads preserve last detection and do not duplicate in-progress reports', async () => {
      await reset(); await upload();
      await pool.query("UPDATE potholes SET status = 'in_progress'");
      await upload([{ ...event, event_id: 'older', detected_at: '2026-11-16T01:00:00Z' }]);
      const row = (await pool.query('SELECT * FROM potholes')).rows[0];
      assert.equal(row.status, 'in_progress');
      assert.equal(row.report_count, 2);
      assert.equal(row.last_detected_at.toISOString(), '2026-11-17T01:00:00.000Z');
      assert.equal(row.first_detected_at.toISOString(), '2026-11-16T01:00:00.000Z');
      assert.equal((await counts()).holes, 1);
    });
    await t.test('concurrent retries increment an existing pothole exactly once', async () => {
      await reset(); await upload([{ ...event, event_id: 'initial' }]);
      const results = (await Promise.all(Array.from({ length: 12 }, () => upload()))).flat();
      assert.equal(results.filter(r => r.action === 'updated').length, 1);
      assert.deepEqual(await counts(), { holes: 1, events: 2, reports: 2 });
    });
    await t.test('sequential replay returns the original pothole_id', async () => {
      await reset(); const first = (await upload())[0]; const replay = (await upload())[0];
      assert.equal(replay.action, 'duplicate'); assert.equal(replay.pothole_id, first.pothole.id);
      assert.deepEqual(await counts(), { holes: 1, events: 1, reports: 1 });
    });
    await t.test('failure linking event rolls back the increment and claim; retry succeeds', async () => {
      await reset(); await upload([{ ...event, event_id: 'initial' }]);
      await pool.query(`CREATE FUNCTION reject_event_link() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'injected link failure'; END $$;
        CREATE TRIGGER reject_event_link BEFORE UPDATE ON pothole_events
        FOR EACH ROW EXECUTE FUNCTION reject_event_link()`);
      try {
        await assert.rejects(upload(), /injected link failure/);
        assert.deepEqual(await counts(), { holes: 1, events: 1, reports: 1 });
      } finally {
        await pool.query('DROP TRIGGER reject_event_link ON pothole_events; DROP FUNCTION reject_event_link()');
      }
      await upload();
      assert.deepEqual(await counts(), { holes: 1, events: 2, reports: 2 });
    });
    await t.test('failure linking a new pothole rolls back its creation', async () => {
      await reset();
      await pool.query(`ALTER TABLE pothole_events ADD CONSTRAINT reject_link CHECK (pothole_id IS NULL)`);
      try {
        await assert.rejects(upload(), /reject_link/);
        assert.deepEqual(await counts(), { holes: 0, events: 0, reports: 0 });
      } finally { await pool.query('ALTER TABLE pothole_events DROP CONSTRAINT reject_link'); }
      await upload(); assert.deepEqual(await counts(), { holes: 1, events: 1, reports: 1 });
    });
    await t.test('lost response after commit is safe to retry', async () => {
      await reset(); failPostCommit = true;
      await assert.rejects(upload(), /post-commit failure/);
      failPostCommit = false;
      const replay = (await upload())[0];
      assert.equal(replay.action, 'duplicate'); assert.equal(replay.pothole_id, 1);
      assert.deepEqual(await counts(), { holes: 1, events: 1, reports: 1 });
    });
    await t.test('invalid ID and invalid event reject the entire batch before mutation', async () => {
      for (const bad of [null, { ...event, event_id: 'x'.repeat(81) }, { ...event, event_id: 42 },
        { ...event, event_id: '' }, { ...event, lat: '-7.77junk' }, { ...event, detected_at: 'not-a-date' }]) {
        await reset();
        await assert.rejects(upload([event, bad]), e => e.statusCode === 400);
        assert.deepEqual(await counts(), { holes: 0, events: 0, reports: 0 });
      }
    });
    await t.test('80-character ID and duplicate within one batch are supported', async () => {
      await reset(); const boundary = { ...event, event_id: 'x'.repeat(80) };
      const result = await upload([boundary, boundary]);
      assert.equal(result[0].action, 'created'); assert.equal(result[1].action, 'duplicate');
      assert.deepEqual(await counts(), { holes: 1, events: 1, reports: 1 });
    });
    await t.test('legacy requests without event ID retain their existing behavior', async () => {
      await reset(); const { event_id, ...legacy } = event;
      await upload([legacy]); await upload([legacy]);
      assert.deepEqual(await counts(), { holes: 1, events: 0, reports: 2 });
    });
    await t.test('DB unavailable rejects event upload instead of acknowledging volatile storage', async () => {
      const disconnected = load('src/services/potholeService.js', {
        '../db': { ...db, isPgConnected: () => false }, '../utils/timestamps': require('../src/utils/timestamps'),
        '../utils/haversine': {}, './roadService': {}, './geocoding': {}, './streetPinService': {},
      });
      await assert.rejects(disconnected.processBatchUpload(null, [event]), e => e.statusCode === 503);
    });
  } finally {
    if (pool) await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
