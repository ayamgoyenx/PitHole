# Status backend — 18 November 2026

Perubahan lokal, belum push/deploy. Tidak mengubah Supabase atau firmware yang sudah dikirim.

## Perbaikan yang sudah diimplementasikan

1. Klaim event_id dan perubahan report_count satu transaksi; duplicate mengembalikan pothole_id lama.
2. Unggahan berbeda pada koordinat berdekatan diserialisasi dengan advisory lock sehingga tidak membuat titik ganda karena request bersamaan. Titik active/in_progress dapat menerima laporan tambahan. Laporan terlambat tidak memundurkan last_detected_at.
3. API alat mewajibkan X-Device-Key, device_id, event_id, batch 1–500 laporan, dan ukuran JSON maksimal 256 KB. Endpoint GET sync juga memakai kunci perangkat. Kunci belum dikonfigurasi menghasilkan 503, kunci salah/kosong menghasilkan 401.
4. Startup menunggu database dan pemeriksaan schema; gagal inisialisasi tidak dilaporkan sebagai layanan siap. Endpoint reset seed dan seed otomatis saat startup dinonaktifkan. Data contoh tidak disisipkan otomatis.
5. CORS hanya untuk FRONTEND_ORIGINS; cookie admin memakai HttpOnly dan, di production, Secure/SameSite=None. Login dibatasi 10 percobaan per IP per 15 menit dalam satu proses. JSON rusak dan error internal ditangani tanpa mengirim detail SQL ke klien.
6. Timestamp harus tanggal kalender ISO dengan zona waktu; bbox dan level pin divalidasi sebelum query.
7. TLS DB_URL memverifikasi sertifikat. Parameter SSL di URL ditolak agar tidak mengalahkan pengaturan verifikasi. Gunakan DB_SSL_CA bila provider memerlukan CA khusus; jangan memakai rejectUnauthorized:false.
8. Download sync mengambil data dan watermark dari DB dalam transaksi dengan SHARE lock singkat. Migrasi 006 memakai jam penulisan aktual untuk updated_at, termasuk transaksi lama yang baru menulis setelah snapshot. Batas last_sync inklusif sehingga pengulangan pada batas milidetik tidak kehilangan data; alat harus upsert berdasarkan pothole ID.
9. Waktu unggahan alat disimpan terpisah dari waktu refresh frontend dan status admin.

## Menjalankan di laptop baru

Gunakan Node.js yang sesuai package-lock, PostgreSQL 17 + PostGIS, dan database development terpisah.

```powershell
cd backend
npm ci
Copy-Item .env.example .env
# Isi .env dengan database DEVELOPMENT, origin frontend, dan secret lokal.
npm run migrate
npm start
```

Jangan menyalin DB_URL Supabase produksi untuk pengujian: migrate/initDb melakukan DDL. Tidak ada seed otomatis. Import jalan dan pembuatan akun admin tersedia melalui scripts terpisah; jalankan hanya pada database tujuan yang sudah diperiksa.

Frontend tetap di frontend2 dengan npm ci lalu npm run dev. File tmp, output, node_modules, .env, build, serta database lokal tidak diperlukan untuk menjalankan kode di laptop lain.

## Konfigurasi sebelum deployment, setelah persetujuan pemilik

- Isi FRONTEND_ORIGINS dengan origin HTTPS frontend persis, tanpa path atau trailing slash. Beberapa origin dipisahkan koma.
- Set ADMIN_SESSION_SECRET dan DEVICE_API_KEY berbeda, acak, minimal 32 karakter. Jangan taruh secret di VITE_* atau Git.
- Teman hardware harus mengisi DEVICE_KEY yang sama dengan DEVICE_API_KEY untuk POST batch-upload dan GET sync. Firmware yang masih memakai kunci kosong akan ditolak oleh backend baru.
- Payload yang disampaikan teman hardware sudah sesuai struktur. Pastikan event_id tetap sama setelah retry/restart dan tersimpan dengan laporan aslinya.
- Migrasi 006 wajib dijalankan sebelum startup versi ini. Tidak mengubah timestamp historis atau menghapus laporan, tetapi penulisan berikutnya memakai trigger jam server.
- Periksa sertifikat CA DB dan topologi proxy sebelum mengisi TRUST_PROXY_HOPS. Jangan mengisi angka sembarang karena dipakai untuk identitas IP pembatas login.
- Cookies lintas situs masih bergantung pada kebijakan browser; domain bersama/reverse proxy frontend adalah opsi jika browser memblokir third-party cookies.

## Sesi admin dan pemulihan pin (migrasi 007)

- Sesi sekarang opaque random token; hanya HMAC token disimpan di admin_sessions. Masa berlaku 8 jam, diperiksa terhadap jam database. Token stateless versi lama tidak diterima lagi; admin harus login ulang.
- Logout mencabut sesi di database sebelum menghapus cookie. Perubahan password/nama akun mencabut seluruh sesi akun; penghapusan akun menghapus sesinya lewat foreign key. Database gagal diakses berarti autentikasi ditolak, bukan diloloskan.
- Trigger potholes dan road_segments menandai street_pin_jobs dalam transaksi yang sama dengan perubahan data. Worker saat startup dan setiap 30 detik memproses antrean; request juga mencoba memperbarui segera.
- Rebuild pin dan penghapusan job satu transaksi. Gagal di tengah rebuild mempertahankan cache lama dan job untuk retry; beberapa worker diserialisasi dengan advisory lock.
- Tidak ada panggilan geocoding jaringan di worker otomatis. Rebuild manual dengan opsi geocode tetap operasi maintenance.
- Semua migrasi, termasuk 007_sessions_and_pin_recovery.sql, harus dijalankan sebelum memulai backend versi ini. Startup memeriksa tabel dan trigger wajib.

## Batas yang belum diselesaikan

- Uji ESP32 nyata: retry setelah restart, respons duplicate, serta kunci perangkat yang baru; belum diuji end-to-end di Railway/Supabase.
- Label validation_methods camera/imu lama belum diubah. Label tersebut tidak membuktikan sensor benar-benar memvalidasi laporan manual; provenance data perlu keputusan tim.
- Kunci perangkat saat ini satu secret bersama, belum key per perangkat/rotasi terpisah. Pembatas login masih per proses, belum shared store lintas replica.
- Turunan street pins dapat sementara tertinggal saat DB bermasalah; cache terakhir dipertahankan dan worker mengulang setiap 30 detik setelah database pulih. Worker memakai full rebuild yang cocok untuk skala saat ini, belum optimasi per jalan.
- Penguncian sinkronisasi dan ingestion sengaja konservatif untuk jumlah alat kecil. Pagination, load test, dan change-log cursor perlu dirancang bila jumlah data/perangkat meningkat. Penghapusan laporan belum memiliki tombstone untuk incremental sync.
- SSL untuk DB_HOST nonlokal belum dikonfigurasi otomatis; gunakan DB_URL untuk koneksi cloud.

Ini bukan pernyataan bahwa seluruh audit keamanan selesai. Tes regresi berada di backend/tests; suite PostgreSQL menggunakan schema sementara pada cluster lokal dan tidak membaca kredensial .env.

Patch snapshot dan paket kiriman lama telah dihapus atas persetujuan pengguna. Gunakan source backend, migrasi, dan tes terbaru untuk melanjutkan pekerjaan. Source hardware tetap dipertahankan.
