# PitHole Project Guide

## 1. Project Purpose

PitHole is a road-pothole reporting and mapping project. Its intended system combines edge-device sensing, a backend API, a database, and web interfaces so reports can be collected and their repair progress can be viewed.

The repository contains working prototypes at different maturity levels. The browser/backend workflow is more complete than the full device workflow. Read **Difference between system design and checked-in firmware** before treating the hardware narrative as deployed functionality.

## 2. High-Level Architecture

```text
Current browser apps
  frontend/ (legacy UI)       frontend2/ (newer routed UI)
            \                  /
             \ -- HTTP /api --/
                       |
                Express backend
                       |
        PostgreSQL if configured, otherwise
          temporary in-memory fallback

Current checked-in sensor path
MPU6050 -- I2C --> STM32F401 -- USART2 --> laptop Python logger

Intended future edge path (system design)
Camera/FOMO + GPS + IMU --> MCU validation and local storage
       --> Wi-Fi sync --> Express API --> shared database/map
```

The web frontends read and display records from the backend. The backend accepts device batches, merges detections close to existing coordinates, serves pothole records, and exposes admin status updates. The current STM32 code is a separate sensor-monitoring prototype; it does not yet call the backend.

## 3. Technology Stack

| Area | Technology in repository | Responsibility |
|---|---|---|
| Backend runtime | Node.js, CommonJS JavaScript | Runs the REST API. |
| HTTP framework | Express 5, `cors`, `dotenv` | Routes, JSON request bodies, environment configuration, and cross-origin support. |
| Database client | `pg` | Connects Express to PostgreSQL. |
| Current database design | PostgreSQL table `potholes`; in-memory fallback if PostgreSQL is unavailable | Stores current canonical pothole locations and status. The in-memory fallback is temporary and is lost when the process stops. |
| Primary newer frontend | React 19, Vite 8, JavaScript/JSX | Beranda, public pothole map, admin login, dashboard, reports, and admin map. |
| Routing | `react-router-dom` | Maps URL paths to React page components. |
| Interactive maps | Leaflet, `react-leaflet`, OpenStreetMap tiles | Displays pothole coordinates and status-colored markers. |
| Icons and animation | `lucide-react`, `framer-motion` | UI icons and Beranda page transitions. |
| Frontend checks | Oxlint, Vite build | Static lint checks and production bundling. |
| Legacy frontend | Separate React/Vite app in `frontend/` | Earlier map-oriented UI; root development scripts still start this app. |
| MCU firmware | C, STM32Cube HAL, STM32CubeIDE project | Reads MPU6050 values over I2C1 and sends CSV-like values over USART2. |
| Laptop sensor monitor | Python, PySerial, pandas, Matplotlib, PyQt5 | Reads STM32 serial data, writes CSV, displays charts, and exports a summary plot. |

Versions are declared in each app's `package.json`. The repository does not declare a shared Node.js version or a Python requirements file; `README_IMU.md` lists the laptop monitor's Python packages.

## 4. Repository Structure

```text
PitHole/
|-- package.json                     # Root scripts; currently starts backend + legacy frontend
|-- package-lock.json
|-- IMPLEMENTATION_CHANGES.md         # Earlier per-file implementation handoff
|-- PROJECT_GUIDE.md                 # This architecture, code, and database guide
|-- README_IMU.md                    # STM32/MPU6050 wiring, UART format, and Python logger guide
|-- backend/
|   |-- .env.example                 # Database and admin environment variable names
|   |-- package.json                 # Express server scripts and dependencies
|   |-- index.js                     # API route definitions and server startup
|   `-- src/
|       |-- db.js                    # PostgreSQL pool, table creation/migration, memory fallback
|       |-- services/
|       |   `-- potholeService.js    # Pothole CRUD-like operations, dedupe, seed, status changes
|       `-- utils/
|           |-- adminAuth.js         # Admin credentials, signed sessions, middleware
|           `-- haversine.js         # Distance between latitude/longitude pairs
|-- frontend/                        # Older/legacy React application; do not confuse with frontend2
|   |-- package.json
|   |-- vite.config.js
|   `-- src/
|       |-- main.jsx                # Legacy React mount
|       |-- App.jsx                 # Legacy map/detail app orchestration
|       |-- App.css / index.css      # Legacy app styles
|       |-- assets/                 # Legacy image assets
|       `-- components/             # Navbar, map, list, details, footer, IoT modal
|-- frontend2/                       # Newer React application
|   |-- package.json
|   |-- vite.config.js              # Vite dev server and /api proxy to port 5000
|   |-- index.html
|   `-- src/
|       |-- main.jsx                # React root + BrowserRouter
|       |-- App.jsx                 # URL-to-page routes
|       |-- App.css / index.css     # Global and shared component styles
|       |-- assets/                 # logo, Beranda illustration, and template assets
|       |-- components/
|       |   |-- Navbar.jsx          # Public responsive navigation
|       |   |-- MapView.jsx         # Public Leaflet map and selected-marker banner
|       |   |-- PotholeList.jsx     # Public status filter and report list
|       |   |-- PotholeDetail.jsx   # Public report detail and mini-map
|       |   |-- Footer.jsx          # Public footer
|       |   `-- IoTTestModal.jsx    # Batch upload/seed testing controls
|       `-- pages/
|           |-- beranda.jsx / beranda.css
|           |-- petajalanberlubang.jsx / petajalanberlubang.css
|           `-- admin/
|               |-- login.jsx       # Backend-connected admin sign in
|               |-- admindashboard.jsx
|               |-- pitholelist.jsx
|               |-- pitholemaps.jsx
|               |-- AdminLayout.jsx
|               |-- AdminMap.jsx
|               |-- useAdminPotholes.js
|               `-- admin.css
`-- IMU/
    |-- imu_monitoring_laptop/
    |   `-- IMU.py                   # UART reader, CSV writer, live/final graphs
    `-- imu_STM32/
        |-- Core/Inc/                # Main and HAL configuration headers
        |-- Core/Src/                # main.c, interrupt, startup support
        |-- Core/Startup/            # STM32 startup assembly
        |-- Drivers/                 # ST HAL and ARM CMSIS vendor code
        |-- Debug/                   # Generated CubeIDE build outputs; not application source
        |-- imu.ioc                  # STM32CubeMX peripheral configuration
        |-- .project / .cproject     # Eclipse/STM32CubeIDE project settings
        `-- STM32F401CCUX_FLASH.ld   # Linker script
```

The `Debug/` and `Drivers/` subtrees contain generated/vendor files. The project-specific firmware logic is primarily in `IMU/imu_STM32/Core/Src/main.c` and its related headers/configuration.

## 5. Web Application Pages and Main Components

### Routes in `frontend2/src/App.jsx`

| URL | Page | Purpose |
|---|---|---|
| `/`, `/beranda`, `/tentang-kami` | `Beranda` | Public landing page. `/tentang-kami` remains an alias for compatibility. |
| `/petajalanberlubang` | `PetaJalanBerlubang` | Public live map, status totals, report list, filtering, and detail view. |
| `/admin`, `/admin-login` | `AdminLogin` | Admin credential form. |
| `/admin-dashboard` | `AdminDashboard` | Status counts, map, recent reports, detection channel summary, and repair-time metric. |
| `/admin-pitholelist` | `AdminPitholeList` | Search/filter report table and status editing. |
| `/admin-pitholemaps`, `/admin-pitholelmaps` | `AdminPitholeMaps` | Admin map and mapped-location list. |
| `*` | Not-found message | Fallback for unknown URLs. |

`main.jsx` mounts the React app once and wraps it with `BrowserRouter`. `Navbar` uses `useNavigate` for public navigation and React state for its mobile hamburger menu. `MapView`, `PotholeList`, and `PotholeDetail` are shared public components. Admin pages use a separate `AdminLayout` and shared `useAdminPotholes` data hook.

The public map and admin pages refresh list data every 30 seconds. The public map uses relative `/api/...` requests, which Vite proxies to the backend while developing `frontend2`.

## 6. Backend and Current API

The API server starts from `backend/index.js`, listens on `PORT` (default `5000`), parses JSON, enables CORS, initializes the database, and seeds demo UGM data if the table is empty.

| Method | Path | Access | Behavior |
|---|---|---|---|
| `GET` | `/api/hello` | Public | Health-check response and timestamp. |
| `POST` | `/api/v1/admin/login` | Public | Checks configured environment username/password; sets signed session cookie on success. |
| `GET` | `/api/v1/admin/session` | Session required | Checks and returns current admin identity. |
| `POST` | `/api/v1/admin/logout` | Public | Expires the session cookie. |
| `POST` | `/api/v1/potholes/batch-upload` | Device integration | Accepts `{sync_time, potholes:[{lat,lon,detected_at}]}` and merges or inserts locations. |
| `GET` | `/api/v1/potholes/sync?last_sync=...` | Device integration | Returns potholes updated since the optional timestamp. |
| `GET` | `/api/v1/potholes` | Public | Returns `stats` and all pothole records. |
| `GET` | `/api/v1/potholes/:id` | Public | Returns one pothole by ID. |
| `PATCH` | `/api/v1/potholes/:id/status` | Admin session required | Changes status to `active`, `in_progress`, or `repaired`. |
| `POST` | `/api/v1/potholes/seed` | Admin session required | Clears/reseeds the table in PostgreSQL; intended for testing only. |

Admin sessions are HMAC-signed cookies that expire after eight hours. The cookie is `HttpOnly`, `SameSite=Strict`, and `Secure` when `NODE_ENV=production`. Admin credentials are a single environment-configured account, not a multi-user identity system.

## 7. Current Pothole Data Model

`backend/src/db.js` creates one `potholes` table with:

| Column | Current meaning |
|---|---|
| `id` | Auto-incremented location identifier. |
| `lat`, `lon` | Floating-point coordinates. |
| `report_count` | Number of reports merged into this location. It does not identify unique people or keep every report row. |
| `status` | Current workflow status: `active`, `in_progress`, or `repaired`. |
| `first_detected_at` | First known detection timestamp. |
| `last_detected_at` | Latest merged detection timestamp. |
| `repaired_at` | Nullable timestamp recorded when status transitions into `repaired`; cleared if reopened. Existing rows cannot be backfilled accurately if their actual repair date is unknown. |
| `updated_at` | Last database record update time; not equivalent to repair time. |
| `validation_methods` | JSONB list, currently commonly `camera` and `imu`. |

`potholeService.js` merges uploaded coordinates within a 3-meter Haversine radius. It averages coordinates weighted by the existing `report_count`, increments the count, and updates `last_detected_at`. This is a useful prototype but loads all potholes and compares them in application code; it will become slow as the data grows.

If PostgreSQL cannot be reached, `db.js` switches to a process-local in-memory array. That fallback supports a demo but is **not persistent**: data disappears when the backend stops or restarts.

## 8. Database Recommendation

### Recommendation: PostgreSQL with PostGIS

Use **PostgreSQL with the PostGIS extension** as the authoritative database. Supabase is a practical hosted PostgreSQL provider if you want managed hosting, backups, dashboard tooling, and optional Supabase Auth. A local PostgreSQL + PostGIS installation is suitable for development.

This fits PitHole because:

- Coordinates are central to the application and reports need radius/nearby searches. PostGIS provides `geography(Point, 4326)`, distance functions in meters, and GiST spatial indexes.
- Locations, raw detections, admin accounts, status transitions, and repair work have relationships that are naturally represented by foreign keys and transactions.
- Status changes and sensor uploads should be auditable and deduplicated, rather than overwriting the only record of an event.
- PostgreSQL supports JSONB for occasional sensor metadata while keeping important searchable fields typed and relational.

A document database such as MongoDB can store coordinates, but it would not be my first choice here: PitHole needs location queries plus consistent links between reports, canonical potholes, admin actions, and repair history. Keep the current PostgreSQL direction and add PostGIS.

### Recommended conceptual tables

| Table | Stores | Key design points |
|---|---|---|
| `potholes` | Canonical road-defect/location record | `id`, `location geography(Point,4326)`, `created_at`, current `workflow_status`, optional `severity_current`, `first_detected_at`, `last_detected_at`, `repaired_at`. Keep one row per real-world defect/location. |
| `pothole_reports` | Every submitted observation, not only the aggregate count | `id`, `pothole_id`, `device_id`, `reported_by` (nullable for anonymous/community), `source`, `detected_at`, `location`, `confidence`, `severity_observed`, `dedupe_key`, optional sensor/media references. Add a unique constraint on an idempotency/dedupe key so a device retry does not count twice. |
| `pothole_status_history` | Every workflow change | `id`, `pothole_id`, `old_status`, `new_status`, `changed_by_admin_id`, `changed_at`, `note`. Write this in the same transaction as the current status update. |
| `condition_assessments` | The physical condition assessment over time | `id`, `pothole_id`, `assessed_at`, `severity`, `depth/diameter` if measured, `confidence`, `method`, optional `report_id`. This separates “how bad is the road damage?” from “what is the repair workflow status?”. |
| `admin_profiles` / roles | Admin identity and authorization metadata | Prefer Supabase Auth or another identity provider for password handling, then store a profile/role linked to its auth user ID. Do not store plaintext passwords in a custom `admins` table. |
| `devices` | Registered edge devices | Stable device identifier, active/revoked state, hardware/software version, last sync, optional owner or deployment area. Authenticate devices separately from admin users. |
| `sync_batches` (optional) | Device upload batches and retry state | Device ID, batch ID, received/processed timestamps, counts, and result. Useful for diagnosing offline sync and making retries idempotent. |

**Important distinction:** `workflow_status` (`active`, `in_progress`, `repaired`) describes repair progress. `severity` (`low`, `medium`, `high`, or measured values) describes the pothole’s physical condition. They answer different questions and should not be combined in one status field.

### Recommended spatial fields and indexes

Store point coordinates as one PostGIS geography column, created from longitude and latitude in that order. Use a GiST index for geographic lookups and ordinary indexes for common filters/history. The following is illustrative target-schema DDL, **not a drop-in migration**: `workflow_status` and the report/history tables must be created or migrated first, and the current table uses `status` instead of `workflow_status`.

```sql
CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE potholes
  ADD COLUMN IF NOT EXISTS location geography(Point, 4326);

CREATE INDEX IF NOT EXISTS potholes_location_gix
  ON potholes USING GIST (location);

CREATE INDEX IF NOT EXISTS potholes_status_idx
  ON potholes (workflow_status);

CREATE INDEX IF NOT EXISTS reports_pothole_detected_idx
  ON pothole_reports (pothole_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS status_history_pothole_changed_idx
  ON pothole_status_history (pothole_id, changed_at DESC);
```

The SQL above illustrates the spatial column and target indexes only. Adding the full new tables/columns requires a deliberate schema migration and backfill; they are **not already present** in the current schema. A nearby-location lookup can then use PostGIS `ST_DWithin(location, query_point, radius_meters)` rather than fetching every location and calculating distances in JavaScript.

### Admin and device security

- Keep administrator identities separate from device identities and credentials.
- For a production multi-admin site, use Supabase Auth or another identity provider plus role-based access checks. The current backend supports one environment-configured admin account and should be considered a starter implementation.
- Give edge devices individual revocable credentials; do not leave the batch-upload API unauthenticated in a production deployment.
- Keep `.env` files and secrets out of source control. Use TLS/HTTPS and backups for hosted data.
- Keep database migrations versioned. Do not use the seed/reset endpoint against production data.

## 9. Edge Device: What Is in This Repository

`README_IMU.md` describes the STM32F401 + MPU6050 monitoring module. The checked-in `main.c` configures I2C1 and USART2, wakes the MPU6050, reads 14 bytes starting at register `0x3B`, parses accelerometer/temperature/gyroscope raw values, and sends seven comma-separated integers at approximately 20 samples per second (50 ms delay). UART is USART2 at 115200 baud.

`IMU/imu_monitoring_laptop/IMU.py` opens a configured serial port (default `COM4`), parses the seven values, saves CSV, graphs accelerometer/gyroscope values, estimates roll/pitch from the accelerometer for a simple 3D bicycle visualization, and saves a final graph. Values are raw sensor LSBs; the code does not currently convert them to SI units or degrees Celsius, and it does not implement full sensor fusion.

### Difference between system design and checked-in firmware

The larger system description also mentions ESP32-S3/OV5640/FOMO camera inference, GPS, microSD storage, ESP-01S Wi-Fi synchronization, and buzzer/LED alerts. Those corresponding firmware modules are **not present in the listed source tree**. The current backend accepts a batch upload and supports delta-style sync, but the current STM32 `main.c` only streams MPU6050 measurements to a laptop over UART. Treat camera inference, GPS validation, offline SD buffering, device-to-server sync, and buzzer behavior as intended/in-progress system design until firmware implementing them is added and tested.

## 10. Running the Project Locally

The repository has two separate frontends. The root `npm run dev` script launches the backend and the old `frontend/`, **not** `frontend2/`.

Typical PowerShell workflow, using separate terminals:

```powershell
# Terminal 1: configure backend/.env first, then
Set-Location backend
npm install
npm start
```

```powershell
# Terminal 2: newer frontend
Set-Location frontend2
npm install
npm run dev
```

The Vite development server prints its local URL. The Vite proxy sends `/api` requests to `http://localhost:5000`. To run the legacy application, use `npm run dev` from the repository root instead.

The root `postinstall` script currently installs dependencies for `backend` and `frontend`, but not `frontend2`; install `frontend2` dependencies separately if needed.

Admin environment variables (documented in `backend/.env.example`):

- `ADMIN_USERNAME`: admin login name.
- `ADMIN_PASSWORD`: unique password, at least 12 characters.
- `ADMIN_SESSION_SECRET`: random secret, at least 32 characters.
- Existing database variables: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`.

The backend currently uses local-style PostgreSQL connection variables with development defaults. Connecting to hosted Supabase may require adding connection-string support and its required TLS/SSL options; follow the provider's current connection instructions rather than copying local defaults.

## 11. Verification and Known Gaps

- `frontend2` has `build` and `lint` scripts. Its production build was verified successfully; Vite emits a non-fatal large-bundle advisory above 500 kB.
- Oxlint reports two existing warnings: an unused `ReactDOM` import in `frontend2/src/main.jsx` and unused `MapController` in `frontend2/src/components/MapView.jsx`.
- Backend syntax and the admin login/session/status/seed authorization flow were checked. The backend package's current `test` script is a placeholder that exits with “no test specified”; automated backend test coverage should be added.
- PostgreSQL was not connected during local verification, so the memory fallback was exercised. A real PostgreSQL/PostGIS deployment and migration should be tested before production.
- Device uploads currently aggregate reports into `report_count`; there is no persisted per-observation table, distinct reporter identity, device registry, evidence/media storage, or full change log for status history.
- The `.env.example` values are placeholders. Configure real secret values locally and do not publish them.
