BEGIN;

CREATE TABLE IF NOT EXISTS pothole_location (
  id SERIAL PRIMARY KEY,
  pothole_id INTEGER NOT NULL UNIQUE REFERENCES potholes(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  id_location INTEGER REFERENCES road_segments(id) ON DELETE SET NULL,
  location_name TEXT
);

CREATE INDEX IF NOT EXISTS pothole_location_id_location_idx ON pothole_location (id_location);

CREATE TABLE IF NOT EXISTS location_stats (
  id_location INTEGER PRIMARY KEY REFERENCES road_segments(id) ON DELETE CASCADE,
  location_name TEXT,
  length_m DOUBLE PRECISION NOT NULL,
  hole_count INTEGER NOT NULL,
  density_per_100m DOUBLE PRECISION NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('severe', 'medium', 'safe')),
  pin_lat DOUBLE PRECISION NOT NULL,
  pin_lon DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS location_stats_level_idx ON location_stats (level);
CREATE INDEX IF NOT EXISTS location_stats_pin_idx ON location_stats (pin_lat, pin_lon);

COMMIT;
