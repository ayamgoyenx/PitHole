CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Supabase exposes public tables via its REST API; with RLS on and no policies,
-- only the backend's direct Postgres connection can read this table.
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
