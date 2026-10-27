# PitHole Backend – Nama Lokasi & Peta Panas Jalan

Requires PostgreSQL with the PostGIS extension. Configure `backend/.env` from `.env.example`
(including `NOMINATIM_USER_AGENT`, e.g. `PitHole/1.0 (contact: you@example.com)`).

## Run order

```bash
cd backend
npm install
npm run migrate                  # 1. road_segments, potholes columns, pothole_location + location_stats (004)
npm run import-roads             # 2. OSM roads, cut into ~100-150 m segments; re-snaps potholes and rebuilds street pins (run once)
npm run backfill-location-names  # 3. fills location_name that is still NULL (Nominatim, max 1 req/s)
npm run rebuild-street-pins      # 4. backfill pothole_location + location_stats for all existing potholes
npm run seed                     # 5. optional: ~80 test potholes around UGM (source = 'seed')
npm start                        # 6. start the API
```

## Street pins (replaces the road heat map)

Pins are read from precomputed tables, so the API never calls OSM and does no spatial joins per request.
Roads with no open pothole get no pin.

- `pothole_location(pothole_id, lat, lon, id_location, location_name)`: link from each pothole to its road segment (`id_location` NULL = no road within 25 m). `potholes` itself is untouched.
- `location_stats(id_location, location_name, length_m, hole_count, density_per_100m, level, pin_lat, pin_lon)`: one row per segment that has open potholes; this is what the API reads.
- Updated incrementally (one segment) on batch-upload, status change and seed; `npm run rebuild-street-pins` and server start rebuild everything.

Density = open potholes / (GREATEST(length_m, MIN_EFFECTIVE_LENGTH_M) / 100). Thresholds live only in `src/config/streetPin.js`
(`THRESHOLD_A = 2.0`, `THRESHOLD_B = 0.8`, `MIN_EFFECTIVE_LENGTH_M = 50`); after changing them run `npm run rebuild-street-pins`.

- `density >= A` → `severe`; `B <= density < A` → `medium`; `0 < density < B` → `safe`.

`GET /api/v1/street-pins?level=severe,medium,safe&bbox=minLon,minLat,maxLon,maxLat` returns `{ config, count, pins[] }`.

`GET /api/road-heat` (heat map below) is **deprecated**; the frontend no longer uses it.

`npm run seed:clear` deletes only rows with `source = 'seed'`. `npm test` runs the unit tests.

Overpass query used by the importer (`scripts/importRoads.js`):

```
[out:json][timeout:180];
way["highway"~"^(primary|secondary|tertiary|residential|unclassified|service)$"](-7.79,110.35,-7.74,110.40);
out geom;
```

## Segment cutting

For each OSM way, `L = ST_Length(geom::geography)`:

- `L < 30 m`: merged into a touching way with the same name, otherwise skipped.
- `L <= 150 m`: one segment.
- `L > 150 m`: `n = round(L / 125)` equal parts via `ST_LineSubstring`.

## Heat map rule

For each segment, `holes` = potholes with status not `repaired` (selesai):

```
length_per_hole = GREATEST(length_m, MIN_EFFECTIVE_LENGTH_M) / holes
```

- `<= SEVERE_MAX_M_PER_HOLE` → red (`severe`, "Parah")
- otherwise → yellow (`mid`, "Sedang")
- `holes = 0` → no color

Change the thresholds only in `src/config/heatmap.js` (`HEATMAP_CONFIG`). `GET /api/road-heat` returns them in
`meta.config` (cached 45 s) and the legend reads them from there. The formula lives in `src/utils/classifySegment.js`.

## Other behaviour

- On creation, a pothole is snapped to the nearest segment within 25 m (`segment_id`). No segment → `needs_review = true`.
- Detections within 5 m of an active pothole increment `report_count` instead of creating a new row.
- `location_name` = segment name, else one Nominatim lookup at creation time. Failure saves `NULL` (UI: "Lokasi tidak diketahui").

## Testing the seed

`npm run seed` prints the number of red / yellow / uncolored segments and the 5 segments with the lowest
`length_per_hole_m`. The seed is deterministic (fixed random seed). It creates 6-8 clustered (red) segments,
10-14 segments with 1-2 potholes (yellow), one road with only repaired potholes (no color) and 3 off-road
points (`needs_review = true`). Check the API with `curl http://localhost:5000/api/road-heat`.
