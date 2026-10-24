BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS road_segments (
  id SERIAL PRIMARY KEY,
  osm_id BIGINT NOT NULL,
  segment_no INTEGER NOT NULL,
  name TEXT,
  geom GEOMETRY(LineString, 4326) NOT NULL,
  CONSTRAINT road_segments_osm_segment_unique UNIQUE (osm_id, segment_no)
);

ALTER TABLE potholes
  ADD COLUMN IF NOT EXISTS location_name TEXT,
  ADD COLUMN IF NOT EXISTS segment_id INTEGER,
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'potholes_segment_id_fkey'
      AND conrelid = 'potholes'::regclass
  ) THEN
    ALTER TABLE potholes
      ADD CONSTRAINT potholes_segment_id_fkey
      FOREIGN KEY (segment_id) REFERENCES road_segments(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS road_segments_geom_gix
  ON road_segments USING GIST (geom);

CREATE INDEX IF NOT EXISTS potholes_segment_id_idx
  ON potholes (segment_id);

CREATE INDEX IF NOT EXISTS potholes_active_coordinates_idx
  ON potholes (status, lat, lon);

COMMIT;
