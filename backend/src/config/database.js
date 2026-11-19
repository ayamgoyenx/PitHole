function databaseConfig(env = process.env) {
  const common = { connectionTimeoutMillis: 10000, statement_timeout: 20000, idle_in_transaction_session_timeout: 20000 };
  if (env.DB_URL) {
    const url = new URL(env.DB_URL);
    // pg URL SSL parameters can override the explicit TLS object. Use one source.
    for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'ssl', 'uselibpqcompat']) {
      if (url.searchParams.has(key)) throw new Error(`Remove ${key} from DB_URL; configure TLS using DB_SSL_CA instead.`);
    }
    const rejectUnauthorized = env.DB_REJECT_UNAUTHORIZED === 'true';
    return { ...common, connectionString: env.DB_URL,
      ssl: { rejectUnauthorized, ...(env.DB_SSL_CA ? { ca: env.DB_SSL_CA.replace(/\\n/g, '\n') } : {}) } };
  }
  return { ...common, host: env.DB_HOST || 'localhost', port: Number(env.DB_PORT || 5432),
    user: env.DB_USER || 'postgres', password: env.DB_PASSWORD || 'postgres', database: env.DB_NAME || 'pithole_db' };
}
module.exports = { databaseConfig };
