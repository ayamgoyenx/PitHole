BEGIN;
-- Real write time, including transactions opened before a device sync snapshot.
CREATE OR REPLACE FUNCTION pithole_set_write_time() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pithole_write_time ON potholes;
CREATE TRIGGER pithole_write_time BEFORE INSERT OR UPDATE ON potholes
FOR EACH ROW EXECUTE FUNCTION pithole_set_write_time();
COMMIT;
