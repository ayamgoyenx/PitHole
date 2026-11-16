// Read-only review of missing location names. Never calls initDb or writes to PostgreSQL.
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { pool } = require('../src/db');
const { reverseGeocode } = require('../src/services/geocoding');

async function main() {
  const client = await pool.connect();
  let rows;
  try {
    await client.query('BEGIN READ ONLY');
    const counts = await client.query(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE NULLIF(BTRIM(location_name), '') IS NULL)::int AS unnamed FROM potholes`);
    const sample = await client.query('SELECT id, lat, lon, location_name FROM potholes WHERE id = 154');
    console.log(JSON.stringify({ counts: counts.rows[0], sample: sample.rows }));
    if (process.argv.includes('--inspect')) return;
    rows = (await client.query(`SELECT id, lat, lon, location_name FROM potholes
      WHERE NULLIF(BTRIM(location_name), '') IS NULL ORDER BY id`)).rows;
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
  if (!process.env.NOMINATIM_USER_AGENT?.trim()) {
    process.env.NOMINATIM_USER_AGENT = 'PitHole/1.0 (+https://surprising-healing-production-fadf.up.railway.app)';
  }
  const outDir = path.join(__dirname, '../output/location-review');
  fs.mkdirSync(outDir, { recursive: true });
  const cachePath = path.join(outDir, 'lookup-cache.json');
  const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : {};
  const proposals = [];
  for (const row of rows) {
    const key = `${row.lat},${row.lon}`;
    const name = cache[key] || await reverseGeocode(row.lat, row.lon);
    if (name) {
      cache[key] = name;
      fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
    }
    proposals.push({ ...row, proposed_name: name, source: 'OpenStreetMap/Nominatim', approved: false });
    fs.writeFileSync(path.join(outDir, 'preview.json'), JSON.stringify(proposals, null, 2));
    console.log(`#${row.id}: ${name || 'Belum ditemukan'}`);
  }
  const escapeCell = v => String(v ?? '').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
  const lines = [ '# Usulan nama lokasi — belum disimpan ke database', '',
    'Sumber: OpenStreetMap/Nominatim. Hasil merupakan alamat terdekat, bukan verifikasi lapangan. Nama wilayah saja dapat muncul jika nama jalan tidak tersedia.', '',
    '| ID | Latitude | Longitude | Usulan nama | Peta |', '|---|---|---|---|---|',
    ...proposals.map(r => `| ${r.id} | ${r.lat} | ${r.lon} | ${escapeCell(r.proposed_name || 'Belum ditemukan')} | [OSM](https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lon}#map=19/${r.lat}/${r.lon}) |`),
    '', 'Semua usulan masih menunggu persetujuan. Belum ada UPDATE yang dijalankan.' ];
  fs.writeFileSync(path.join(outDir, 'preview.md'), lines.join('\n'));
  console.log(JSON.stringify({ reviewed: proposals.length, named: proposals.filter(r => r.proposed_name).length, preview: path.join(outDir, 'preview.md') }));
}

if (require.main === module) main().catch(e => {
  console.error(`[Preview] ${e.code || e.message}`);
  process.exitCode = 1;
}).finally(() => pool.end());

module.exports = { main };
