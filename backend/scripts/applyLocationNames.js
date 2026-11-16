// Applies an explicitly reviewed preview; updates location_name only.
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { pool } = require('../src/db');

async function main() {
  const [mode, file] = process.argv.slice(2);
  if (!['--check', '--apply'].includes(mode) || !file || process.argv.length !== 4) {
    throw new Error('Usage: node scripts/applyLocationNames.js --check|--apply reviewed.json');
  }
  const manifestPath = path.resolve(file);
  const proposals = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!Array.isArray(proposals) || !proposals.length) throw new Error('Empty manifest.');
  const ids = new Set();
  for (const p of proposals) {
    if (!Number.isInteger(p.id) || ids.has(p.id) || !Number.isFinite(p.lat)
        || !Number.isFinite(p.lon) || typeof p.proposed_name !== 'string' || !p.proposed_name.trim()) {
      throw new Error('Invalid or duplicate proposal.');
    }
    ids.add(p.id);
  }
  const client = await pool.connect();
  try {
    await client.query(mode === '--apply' ? 'BEGIN' : 'BEGIN READ ONLY');
    const before = (await client.query(`SELECT * FROM potholes WHERE id = ANY($1::int[]) ORDER BY id
      ${mode === '--apply' ? 'FOR UPDATE' : ''}`, [[...ids]])).rows;
    const byId = new Map(before.map(r => [r.id, r]));
    const pending = [];
    for (const p of proposals) {
      const row = byId.get(p.id);
      if (!row || Number(row.lat) !== p.lat || Number(row.lon) !== p.lon) {
        throw new Error(`Point #${p.id} is missing or coordinates changed. No updates saved.`);
      }
      if (row.location_name === p.proposed_name.trim()) continue;
      if (row.location_name?.trim()) throw new Error(`Point #${p.id} already has another name. No updates saved.`);
      pending.push(p);
    }
    if (mode === '--check') {
      await client.query('ROLLBACK');
      console.log(JSON.stringify({ reviewed: proposals.length, pending: pending.length, alreadyMatching: proposals.length - pending.length }));
      return;
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(path.dirname(manifestPath), `before-apply-${timestamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(before, null, 2), { flag: 'wx' });
    for (const p of pending) {
      const result = await client.query(`UPDATE potholes SET location_name = $1
        WHERE id = $2 AND NULLIF(BTRIM(location_name), '') IS NULL RETURNING id`, [p.proposed_name.trim(), p.id]);
      if (result.rowCount !== 1) throw new Error(`Update conflict #${p.id}`);
    }
    const after = (await client.query('SELECT * FROM potholes WHERE id = ANY($1::int[]) ORDER BY id', [[...ids]])).rows;
    for (const row of after) {
      const old = byId.get(row.id);
      for (const key of Object.keys(old)) {
        if (key !== 'location_name' && JSON.stringify(old[key]) !== JSON.stringify(row[key])) {
          throw new Error(`Unexpected change to ${key} on #${row.id}; rolling back.`);
        }
      }
      const expected = proposals.find(p => p.id === row.id).proposed_name.trim();
      if (row.location_name !== expected) throw new Error(`Name verification failed #${row.id}`);
    }
    await client.query('COMMIT');
    const result = { committed: true, updated: pending.length, verified: after.length, onlyColumnChanged: 'location_name', backupPath };
    fs.writeFileSync(path.join(path.dirname(manifestPath), `applied-${timestamp}.json`), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());
