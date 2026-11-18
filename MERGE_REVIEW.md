# Hasil rekonsiliasi lokal PitHole — 19 November 2026

Sumber yang diperiksa:
- nevritaasy/PitHole main: `7de3f5345af579794fa1163a11021cc4d100e499`
- ayamgoyenx/PitHole main: `38c834bdcdd49401781b312751963527d54f158b`
- Branch hasil: `codex/reconcile-fork`, hanya lokal. Tidak push/deploy/migrasi production.

## Keputusan penggabungan

Enam commit khusus fork menyentuh 12 file; merge menghasilkan tujuh konflik.

| Bagian | Keputusan |
| --- | --- |
| backend/index.js | Pertahankan middleware keamanan, CORS credentials, sesi DB, event_id, dan startup recovery dari upstream terbaru. |
| backend/src/utils/adminAuth.js | Pertahankan sesi DB terbaru; perilaku cookie production SameSite=None + Secure dari fork sudah tercakup. |
| frontend2/src/api.js | Pertahankan VITE_API_URL dan readJson terbaru. |
| AdminLayout.jsx, login.jsx, useAdminPotholes.js, petajalanberlubang.jsx | Pertahankan upstream terbaru; API base dan credentials fork sudah tercakup langsung atau lewat usePotholes. |
| StreetPinLayer.jsx, useRoadHeat.js | Hapus import apiUrl ganda dari auto-merge; fungsi deployment tetap ada. |
| backend/package.json | Ambil fork: start memakai node index.js, dev memakai nodemon index.js. |
| backend/.dockerignore | Ambil fork: abaikan node_modules, .env*, tests. |
| apiSafety.js | Tambahkan fallback FRONTEND_URL agar konfigurasi lama Railway tetap dikenali. FRONTEND_ORIGINS bila diset (termasuk kosong) mengalahkan fallback; allowlist tidak digabung. |
| IoTTestModal.jsx | Pertahankan perubahan apiUrl/credentials fork. Komponen lama ini tidak digunakan oleh halaman aktif; endpoint seed tetap tidak diaktifkan. |

## Konfigurasi deployment yang harus dicocokkan sebelum deployment terpisah

Nilai dashboard Railway tidak tersedia dalam Git; hasil ini mempertahankan kontrak konfigurasi kode, bukan memverifikasi setting dashboard.

- Backend root directory `backend`; install dari lockfile; start `npm start` (node, bukan nodemon). PORT tetap dari environment Railway.
- NODE_ENV=production untuk cookie HTTPS cross-site.
- FRONTEND_URL lama boleh dipakai bila FRONTEND_ORIGINS belum diset. Isi origin frontend HTTPS tanpa slash akhir, daftar dipisah koma. Jika keduanya ada, FRONTEND_ORIGINS yang berlaku.
- Frontend root directory `frontend2`; build `npm run build`; VITE_API_URL harus berisi URL backend ketika build. Pertahankan layanan hosting existing dengan fallback SPA untuk route React. Konfigurasi start/hosting dashboard tidak diubah atau diasumsikan sudah terverifikasi.
- Pertahankan DB_URL dan sertifikat DB_SSL_CA jika diperlukan; kode terbaru menolak parameter URL override TLS seperti sslmode. Jangan menonaktifkan verifikasi sertifikat.
- ADMIN_SESSION_SECRET dan DEVICE_API_KEY tetap diperlukan sesuai BACKEND_HANDOFF.md; kunci C3 harus cocok. Jangan masukkan kunci perangkat ke frontend.
- Migrasi 006/007 wajib tersedia sebelum backend terbaru berjalan. Tidak ada migrasi dijalankan dalam pekerjaan merge ini.
- Pengaturan auto-deploy dan domain Railway harus diperiksa sebelum push/merge ke branch deployment; pekerjaan ini tidak mengubah remote.

## Verifikasi lokal

- Backend: 32 tes lulus, 0 gagal; dua suite integrasi PostgreSQL/PostGIS dilewati karena database uji tidak dijalankan.
- Frontend: 3 tes Node + 16 tes Vitest lulus; build dan lint lulus.
- Tes HTTP tambahan menguji FRONTEND_URL lama, preflight PATCH dengan credentials, prioritas FRONTEND_ORIGINS, dan penolakan origin di luar allowlist.
- Dependencies dipakai ulang melalui junction ke node_modules di D:/PitHole; ini bukan verifikasi clean install dari lockfile.
- Database production tidak dihubungi. Folder kerja D:/PitHole tidak diubah.
- Sumber hardware dan backup.sql tetap sama dengan upstream. Tidak ada file pengguna dihapus.

Hasil merge menyertakan kedua riwayat sebagai parent commit; jangan menyalin file saja untuk menggantikan penggabungan riwayat. Ketika sudah siap, branch hasil dapat dibawa ke repository tujuan dan ditinjau sebelum digabungkan. Tidak ada push dilakukan di sini.
