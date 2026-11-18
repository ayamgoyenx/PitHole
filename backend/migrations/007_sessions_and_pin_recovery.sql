BEGIN;
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx ON admin_sessions(expires_at);
ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION revoke_changed_admin_sessions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.password_hash IS DISTINCT FROM NEW.password_hash OR OLD.username IS DISTINCT FROM NEW.username THEN
    DELETE FROM admin_sessions WHERE admin_id = OLD.id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS admin_credentials_changed ON admins;
CREATE TRIGGER admin_credentials_changed AFTER UPDATE ON admins
FOR EACH ROW EXECUTE FUNCTION revoke_changed_admin_sessions();

-- Durable coalesced queue: committed source changes cannot lose their repair job.
CREATE TABLE IF NOT EXISTS street_pin_jobs (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE street_pin_jobs ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION queue_street_pin_rebuild() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO street_pin_jobs(id) VALUES (1)
  ON CONFLICT (id) DO UPDATE SET requested_at = clock_timestamp();
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS potholes_pin_rebuild ON potholes;
CREATE TRIGGER potholes_pin_rebuild AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON potholes
FOR EACH STATEMENT EXECUTE FUNCTION queue_street_pin_rebuild();
DROP TRIGGER IF EXISTS roads_pin_rebuild ON road_segments;
CREATE TRIGGER roads_pin_rebuild AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON road_segments
FOR EACH STATEMENT EXECUTE FUNCTION queue_street_pin_rebuild();
INSERT INTO street_pin_jobs(id) VALUES (1) ON CONFLICT DO NOTHING;
COMMIT;
