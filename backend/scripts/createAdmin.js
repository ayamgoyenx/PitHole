const bcrypt = require('bcryptjs');
const { initDb, isPgConnected, pool } = require('../src/db');

// Usage: npm run create-admin -- <username> <password>
async function main() {
  const [username, password] = process.argv.slice(2);
  if (!username || !password || password.length < 12) {
    throw new Error('Usage: npm run create-admin -- <username> <password (min 12 chars)>');
  }
  await initDb();
  if (!isPgConnected()) throw new Error('PostgreSQL is unavailable.');

  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO admins (username, password_hash) VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [username, hash],
  );
  console.log(`[Admin] Admin "${username}" saved.`);
}

main()
  .catch((error) => {
    console.error(`[Admin] ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
