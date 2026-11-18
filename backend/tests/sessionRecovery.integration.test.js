const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const port = process.env.PITHOLE_EVENT_TEST_PORT;
test('persistent sessions and durable street-pin recovery', { skip: !port }, async t => {
  const { Pool } = require('pg');
  const config = { host: '127.0.0.1', port: Number(port), user: process.env.PITHOLE_EVENT_TEST_USER || 'pithole_test', database: 'postgres' };
  const admin = new Pool(config);
  const schema = `recovery_test_${process.pid}_${Date.now()}`;
  let pool;
  function load(file, deps) {
    const context = { module: { exports: {} }, require: name => {
      if (!(name in deps)) throw new Error(`Unexpected dependency ${name}`);
      return deps[name];
    }, process: { env: { ADMIN_SESSION_SECRET: 'local-integration-test-secret-1234567890' } }, Buffer, console, setInterval, clearInterval, setTimeout, clearTimeout };
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
      .replace(/CREATE TABLE IF NOT EXISTS (\w+)/g, `CREATE TABLE IF NOT EXISTS ${schema}.$1`);
    vm.runInNewContext(source, context);
    return context.module.exports;
  }
  try {
    await admin.query('CREATE EXTENSION IF NOT EXISTS postgis');
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ ...config, options: `-c search_path=${schema},public` });
    const db = load('src/db.js', { pg: { Pool: function () { return pool; } }, dotenv: { config() {} }, './config/database': { databaseConfig: () => ({}) } });
    await db.initDb();
    for (const file of fs.readdirSync(path.join(__dirname, '../migrations')).filter(f => f.endsWith('.sql')).sort()) {
      const sql = fs.readFileSync(path.join(__dirname, '../migrations', file), 'utf8')
        .replace(/CREATE TABLE (IF NOT EXISTS )?(\w+)/g, (_, optional, name) => `CREATE TABLE ${optional || ''}${schema}.${name}`);
      await pool.query(sql);
    }
    const authDeps = { bcryptjs: require('bcryptjs'), 'node:crypto': require('node:crypto'), '../db': db };
    const auth = load('src/utils/adminAuth.js', authDeps);
    const hash = await require('bcryptjs').hash('test-only-password', 4);
    await pool.query('INSERT INTO admins(username,password_hash) VALUES($1,$2)', ['tester', hash]);
    const cookie = token => ({ headers: { cookie: `${auth.COOKIE_NAME}=${token}` } });
    await t.test('logout revokes a copied token across service instances', async () => {
      const credentials = await auth.verifyCredentials('tester', 'test-only-password');
      const token = await auth.createSessionToken(credentials);
      const secondInstance = load('src/utils/adminAuth.js', authDeps);
      assert.equal((await secondInstance.readSession(cookie(token))).sub, 'tester');
      const stored = (await pool.query('SELECT token_hash FROM admin_sessions')).rows[0].token_hash;
      assert.notEqual(stored, token);
      await auth.revokeSession(cookie(token));
      assert.equal(await secondInstance.readSession(cookie(token)), null);
    });
    await t.test('expired sessions and removed accounts are denied', async () => {
      const credentials = await auth.verifyCredentials('tester', 'test-only-password');
      const token = await auth.createSessionToken(credentials);
      await pool.query("UPDATE admin_sessions SET expires_at = clock_timestamp() - interval '1 second'");
      assert.equal(await auth.readSession(cookie(token)), null);
      const token2 = await auth.createSessionToken(credentials);
      await pool.query("UPDATE admins SET username = 'renamed' WHERE username = 'tester'");
      assert.equal(await auth.readSession(cookie(token2)), null);
      await pool.query("UPDATE admins SET username = 'tester'");
    });
    await t.test('password change revokes sessions and rejects stale login credentials', async () => {
      const credentials = await auth.verifyCredentials('tester', 'test-only-password');
      const token = await auth.createSessionToken(credentials);
      await pool.query("UPDATE admins SET password_hash = 'new-hash' WHERE username = 'tester'");
      assert.equal(await auth.readSession(cookie(token)), null);
      await assert.rejects(auth.createSessionToken(credentials), e => e.statusCode === 401);
      await pool.query('UPDATE admins SET password_hash = $1', [hash]);
      const token2 = await auth.createSessionToken(await auth.verifyCredentials('tester', 'test-only-password'));
      await pool.query('DELETE FROM admins');
      assert.equal(await auth.readSession(cookie(token2)), null);
    });
    const pinDeps = {
      '../db': db, '../config/streetPin': require('../src/config/streetPin'),
      '../utils/classifyLocation': require('../src/utils/classifyLocation'),
      './roadService': { ROAD_SNAP_RADIUS_METERS: 25 }, './geocoding': { reverseGeocode: async () => null },
    };
    const pins = load('src/services/streetPinService.js', pinDeps);
    await pool.query("INSERT INTO road_segments(osm_id,part_index,name,geom,length_m) VALUES(1,1,'Test road',ST_GeomFromText('LINESTRING(110.37 -7.77,110.371 -7.77)',4326),110)");
    await pool.query("INSERT INTO potholes(lat,lon,status,first_detected_at,last_detected_at) VALUES(-7.77,110.3701,'active',now(),now())");
    await t.test('source change creates durable job and recovery builds the pin', async () => {
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM street_pin_jobs')).rows[0].n, 1);
      await pins.recoverPending();
      assert.equal((await pins.getStreetPins())[0].hole_count, 1);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM street_pin_jobs')).rows[0].n, 0);
    });
    await t.test('failure after deleting cache rolls back and retry survives restart', async () => {
      await pool.query("INSERT INTO potholes(lat,lon,status,first_detected_at,last_detected_at) VALUES(-7.77,110.3702,'active',now(),now())");
      await pool.query(`CREATE FUNCTION reject_pin() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected pin failure'; END $$;
        CREATE TRIGGER reject_pin BEFORE INSERT ON location_stats FOR EACH ROW EXECUTE FUNCTION reject_pin()`);
      const result = await pins.recoverPending();
      assert.equal(result.pending, true);
      assert.equal((await pins.getStreetPins())[0].hole_count, 1);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM street_pin_jobs')).rows[0].n, 1);
      await pool.query('DROP TRIGGER reject_pin ON location_stats; DROP FUNCTION reject_pin()');
      const restarted = load('src/services/streetPinService.js', pinDeps);
      await restarted.recoverPending();
      assert.equal((await restarted.getStreetPins())[0].hole_count, 2);
    });
    await t.test('concurrent workers converge and repaired reports remove their pin', async () => {
      await pool.query("UPDATE potholes SET status = 'repaired'");
      await Promise.all([pins.recoverPending(), pins.recoverPending()]);
      assert.equal((await pins.getStreetPins()).length, 0);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM street_pin_jobs')).rows[0].n, 0);
    });
    await t.test('rolled-back report changes do not leave repair jobs', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("UPDATE potholes SET status = 'active'");
        await client.query('ROLLBACK');
      } finally { client.release(); }
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM street_pin_jobs')).rows[0].n, 0);
    });
  } finally {
    if (pool) await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
