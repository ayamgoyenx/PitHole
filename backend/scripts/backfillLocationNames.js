// Preview only: review proposed names before any database changes.
const { main: backfillLocationNames } = require('./previewLocationNames');
const { pool } = require('../src/db');

if (require.main === module) {
  backfillLocationNames()
    .then(() => console.log('[Backfill] Preview complete. No database rows were changed.'))
    .catch((error) => {
      console.error(`[Backfill] ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { backfillLocationNames };
