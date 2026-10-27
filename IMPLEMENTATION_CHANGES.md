# PitHole Code Change Summary

## Scope

This document records the code changes made during this PitHole work. The existing `frontend/` directory was not edited. The implementation changes target `frontend2/` and `backend/`.

The rename from the About page (`tentang-kami`) to `Beranda` was made by the project owner after the initial hero implementation. That rename is identified separately below so it is not confused with an edit I made.

## File-by-File Change Table

| File | Change type | What changed | Why / behavior |
|---|---|---|---|
| `frontend2/src/components/Navbar.jsx` | Updated | Added the responsive hamburger toggle, open/close state, Lucide menu/close icons, and close-after-navigation behavior. Kept the page links and language/admin controls in the mobile menu. | Avoids squeezing all navigation labels into a phone-width row. |
| `frontend2/src/index.css` | Updated | Added navbar alignment and responsive menu/dropdown rules; adjusted navbar item alignment; loaded Manrope to match the existing font variable. | Centers public navigation on wide screens, provides a usable mobile dropdown, and aligns the logo/controls. |
| `frontend2/src/pages/tentang-kami.jsx` | Updated earlier in this conversation; later renamed by project owner | Built the original hero composition using the uploaded road background, cyclist, and PitHole logo, with motion and responsive text layout. | Recreated the supplied landing-page reference using the project’s assets. The owner later renamed this page to `beranda.jsx`. |
| `frontend2/src/pages/tentang-kami.css` | Added earlier in this conversation; later renamed/copied by project owner | Added page-scoped hero styles for the scenery, centered headline/logo, cyclist placement, scroll control, and mobile sizing. | Tailwind utility classes were not configured in the project, so the hero needed real CSS rules. The owner later switched to `beranda.css`. |
| `frontend2/src/App.jsx` | Updated | Connected the Beranda, public map, and admin pages to React Router; added `/admin` and `/admin-login` aliases and both admin-map URL spellings. | Ensures every URL renders its intended page and keeps existing links compatible. |
| `frontend2/src/pages/petajalanberlubang.jsx` | Updated | Replaced the empty page with live pothole loading, status totals, refresh timing, loading/error states, map selection, filters, and a detail view. | Makes the public map route useful to visitors and connects it to backend reports. |
| `frontend2/src/pages/petajalanberlubang.css` | Added | Added responsive page layout and styles using the Beranda color palette. | Keeps map controls, summary counts, map, and list readable at desktop and mobile sizes. |
| `frontend2/src/pages/admin/admin.css` | Added | Added the separate admin visual system, sidebar/top bar, dashboard metrics, tables, map layout, login panel, responsive styles, and mobile logout control. | Gives admin tools a dense, operations-focused layout distinct from the public landing page. |
| `frontend2/src/pages/admin/AdminLayout.jsx` | Added | Added shared admin navigation, session check, protected-page rendering, and logout behavior. | Keeps admin navigation consistent and sends unauthenticated users to the login page. |
| `frontend2/src/pages/admin/AdminMap.jsx` | Added | Added a reusable Leaflet map with status-colored pothole markers. | Provides the map visualization for both admin overview and map pages. |
| `frontend2/src/pages/admin/useAdminPotholes.js` | Added | Added shared API loading, 30-second polling, error/loading state, and authenticated status-update logic. | Avoids duplicating data-fetch and update behavior across admin screens. |
| `frontend2/src/pages/admin/login.jsx` | Updated | Replaced the empty placeholder with a responsive sign-in form connected to the backend. | Provides real credential verification and shows server/configuration errors instead of faking login. |
| `frontend2/src/pages/admin/admindashboard.jsx` | Updated | Added total and per-status counts, status distribution, map, latest detections, report averages, detection-channel coverage, and repair-time average. | Gives admins an at-a-glance picture of current reports and repair progress. |
| `frontend2/src/pages/admin/pitholelist.jsx` | Updated | Added a filterable/searchable report table and status selectors that call the backend PATCH endpoint. | Lets an authenticated admin review reports and change their statuses. |
| `frontend2/src/pages/admin/pitholemaps.jsx` | Updated | Added a dedicated admin map and color/status location list. | Lets admins compare pothole locations geographically and by status. |
| `backend/src/utils/adminAuth.js` | Added | Added environment-config checks, timing-safe credential comparisons, HMAC session signing/verification, HttpOnly cookie handling, and admin middleware. | Provides the server-side authentication foundation without hard-coded credentials or a new package. |
| `backend/index.js` | Updated | Added admin login/session/logout APIs; required an admin session for status changes and the destructive seed/reset endpoint. | Protects admin mutations while leaving public report reads and device batch uploads available. |
| `backend/src/db.js` | Updated | Added nullable `repaired_at` to new tables and an idempotent migration for existing PostgreSQL tables. | Gives the system a dedicated repair-completion timestamp. |
| `backend/src/services/potholeService.js` | Updated | Records `repaired_at` on a real transition to repaired, clears it when reopened, and mirrors this in-memory. | Supports a meaningful repair-time calculation and avoids treating generic `updated_at` as the repair time. |
| `backend/.env.example` | Updated | Added placeholders for `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `ADMIN_SESSION_SECRET`. | Documents how to enable backend authentication locally. |
| `IMPLEMENTATION_CHANGES.md` | Updated | Replaced the short change list with this per-file explanation, API table, setup steps, and verification notes. | Provides the requested handoff describing what each code file does. |

## API Changes

| Method and path | Access | Purpose |
|---|---|---|
| `POST /api/v1/admin/login` | Public | Checks environment-configured username/password and sets a signed admin session cookie. |
| `GET /api/v1/admin/session` | Session required | Confirms that the current browser has a valid admin session. |
| `POST /api/v1/admin/logout` | Public; clears cookie | Ends the browser session by expiring its cookie. |
| `GET /api/v1/potholes` | Public | Existing report-list API; used by the public map and admin dashboards. |
| `PATCH /api/v1/potholes/:id/status` | Admin session required | Updates a pothole to `active`, `in_progress`, or `repaired`; manages `repaired_at`. |
| `POST /api/v1/potholes/seed` | Admin session required | Runs the destructive seed/reset operation. |
| `POST /api/v1/potholes/batch-upload` | Device/public integration | Existing edge-device batch-upload API; remains available for device synchronization. |

All frontend requests use the relative `/api` URL and the existing Vite proxy to `http://localhost:5000` during development.

## Admin Data and Metric Notes

- Admin data is refreshed every 30 seconds; manual refresh is also available.
- `repaired_at` is set when a report changes into `repaired` and reset if the report is reopened.
- The repair duration is measured from `first_detected_at` to `repaired_at` for records with both timestamps. Existing/seeded repaired rows have no known completion time and are excluded; the dashboard reports the timed sample count and shows `N/A` if no valid samples exist.
- Camera and IMU counts summarize `validation_methods`. “Multiple reports” means `report_count > 1`; it does not mean distinct users, because the current backend does not identify individual reporters.

## Configuration and Running

1. Configure `backend/.env` from `backend/.env.example` (preserve any existing database settings).
2. Set a unique `ADMIN_USERNAME`, an `ADMIN_PASSWORD` of at least 12 characters, and an `ADMIN_SESSION_SECRET` of at least 32 characters. Replace the example placeholders. Never commit real credentials or the session secret.
3. Start the backend from the `backend/` directory, then start Vite from `frontend2/`.
4. Open `/admin-login` and sign in with the configured values. `/admin` is an alias.

The implementation uses one environment-configured admin account, not a full user-management system. For production, use HTTPS (the session cookie is `Secure` when `NODE_ENV=production`), protect environment secrets, and consider login rate limiting and managed user accounts.

## Verification

| Check | Result |
|---|---|
| `frontend2` production build | Passes. Vite prints a non-fatal advisory that the generated JavaScript chunk exceeds 500 kB. |
| `frontend2` lint | The new warnings were resolved. Two existing warnings remain: unused `ReactDOM` in `src/main.jsx` and unused `MapController` in `src/components/MapView.jsx`. |
| Backend JavaScript syntax checks | Pass for `index.js`, `src/db.js`, `src/services/potholeService.js`, and `src/utils/adminAuth.js`. |
| Authentication and API checks | Valid login/session works; anonymous status and seed/reset calls are rejected; authenticated calls succeed; logout invalidates the session. |
| Browser checks | Verified admin login, dashboard data/map, report status update, repair timestamp creation, public map route, and responsive admin navigation. |
| Scope restriction | `frontend/` was not edited. A separate one-line root `package-lock.json` metadata diff was observed and left untouched. |
