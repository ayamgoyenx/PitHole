const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
test('database readiness is set only after initialization and failed clients are released', async () => {
  let released = 0;
  const client = { query: async () => { throw new Error('DDL failed'); }, release: () => released++ };
  const pool = { connect: async () => client, on() {} };
  const context = { module: { exports: {} }, process: { env: {} }, console: { log() {}, error() {} },
    require: name => name === 'pg' ? { Pool: function () { return pool; } } : name === './config/database' ? { databaseConfig: () => ({}) } : { config() {} } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/db.js'), 'utf8'), context);
  const db = context.module.exports;
  await assert.rejects(db.initDb(), /DDL failed/);
  assert.equal(db.isPgConnected(), false); assert.equal(released, 1);
  await assert.rejects(db.query('SELECT 1'), e => e.statusCode === 503);
  client.query = async () => ({ rows: [] });
  await db.initDb(); assert.equal(db.isPgConnected(), true); assert.equal(released, 2);
});
