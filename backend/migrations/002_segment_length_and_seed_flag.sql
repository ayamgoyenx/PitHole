BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'road_segments' AND column_name = 'segment_no'
  ) THEN
    ALTER TABLE road_segments RENAME COLUMN segment_no TO part_index;
  END IF;
END $$;

ALTER TABLE road_segments
  ADD COLUMN IF NOT EXISTS part_index INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS length_m DOUBLE PRECISION;

UPDATE road_segments
SET length_m = ST_Length(geom::geography)
WHERE length_m IS NULL;

ALTER TABLE potholes
  ADD COLUMN IF NOT EXISTS source TEXT;

CREATE INDEX IF NOT EXISTS potholes_source_idx
  ON potholes (source);

COMMIT;
