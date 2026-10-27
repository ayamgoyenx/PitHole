BEGIN;

-- One pin per road name: key = lower-cased road name without the ", locality" suffix
-- (falls back to the segment id when no name is known). NULL when the pothole is not near any road.
ALTER TABLE pothole_location
  ADD COLUMN IF NOT EXISTS location_key TEXT GENERATED ALWAYS AS (
    CASE WHEN id_location IS NULL THEN NULL
         ELSE COALESCE(NULLIF(lower(btrim(split_part(location_name, ',', 1))), ''), 'seg:' || id_location::text)
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS pothole_location_key_idx ON pothole_location (location_key);

-- location_stats becomes one row per road (location_key) instead of one per segment.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'location_stats' AND column_name = 'location_key'
  ) THEN
    DROP TABLE location_stats;
    CREATE TABLE location_stats (
      location_key TEXT PRIMARY KEY,
      id_location INTEGER REFERENCES road_segments(id) ON DELETE SET NULL,
      location_name TEXT,
      length_m DOUBLE PRECISION NOT NULL,
      segment_count INTEGER NOT NULL,
      hole_count INTEGER NOT NULL,
      density_per_100m DOUBLE PRECISION NOT NULL,
      level TEXT NOT NULL CHECK (level IN ('severe', 'medium', 'safe')),
      pin_lat DOUBLE PRECISION NOT NULL,
      pin_lon DOUBLE PRECISION NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX location_stats_level_idx ON location_stats (level);
    CREATE INDEX location_stats_pin_idx ON location_stats (pin_lat, pin_lon);
  END IF;
END $$;

COMMIT;
