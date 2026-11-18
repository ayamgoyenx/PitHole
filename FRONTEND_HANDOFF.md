# Perbaikan frontend PitHole — 17 November 2026

Status: perubahan lokal di `frontend2`, belum deploy/push. Tidak ada file dihapus.

## Perubahan

- Tombol ID/EN berfungsi pada halaman publik, login, dan admin; pilihan disimpan di browser.
- Tombol Lokasi saya meminta izin lokasi saat diklik, memusatkan peta, menampilkan titik perangkat dan radius akurasi. Tombol UGM tetap tersedia. Penolakan izin, timeout, dan lokasi tidak tersedia mempunyai pesan yang bisa ditindaklanjuti.
- Admin memilih status, meninjau status lama → baru, lalu mengonfirmasi. Notifikasi sukses hanya muncul setelah API mengonfirmasi perubahan. Klik ganda dicegah; kegagalan dan sesi berakhir ditampilkan di dialog.
- Waktu sinkronisasi alat dipisahkan dari waktu halaman mengambil data. Polling 30 detik; kegagalan mempertahankan data terakhir dengan penanda kesalahan, bukan menampilkan nol seolah-olah sukses.
- Detail mengikuti data terbaru tanpa perlu ditutup; tanggal dinyatakan dalam WIB; koordinat invalid tidak ditampilkan sebagai penanda nol.
- Filter status, pencarian, lokasi, dan tanggal admin diperjelas. Tombol lokasi berada di atas peta; legenda mengambang dan dapat dibuka-tutup pada HP. Layout HP memakai kartu laporan, dialog yang bisa digulir, dan tombol sentuh lebih besar.
- Label kepadatan rendah tidak menjanjikan jalan bebas lubang. Informasi validasi hanya ditampilkan bila tersedia dari API.
- Route dimuat bertahap. URL API mendukung VITE_API_URL. Dependensi diperbarui melalui npm audit fix tanpa --force.

## Dukungan backend untuk waktu alat

Frontend membaca `GET /api/v1/potholes` → `sync.last_device_sync_at`.
Backend menambahkan tabel `device_sync_state` saat initDb dan mencatat jam server sesudah batch non-kosong dengan device_id selesai diproses. Retry duplicate yang diakui server termasuk komunikasi alat yang berhasil. Batch invalid/tanpa device_id tidak memperbarui waktu. Refresh browser dan perubahan status admin tidak memperbaruinya.

Ini adalah waktu unggahan data alat terakhir yang berhasil diproses backend, bukan waktu deteksi lubang, heartbeat alat, atau bukti bahwa alat masih online. Nilai merupakan waktu terbaru lintas perangkat. Firmware yang dikirim sebelumnya sudah mengirim device_id.

Riwayat sebelum fitur ini tidak direkonstruksi. Sebelum backend pendukung tersedia dan unggahan pertama tercatat, frontend menampilkan bahwa waktu sinkronisasi belum tersedia. Tidak perlu mengubah paket hardware yang sudah dikirim untuk fitur frontend ini.

## Verifikasi

- Frontend: 3 tes utilitas dan 16 tes interaksi lulus. Termasuk izin lokasi/sukses/gagal, pilihan bahasa, konfirmasi/batal/gagal/sesi berakhir/klik ganda, notifikasi admin setelah PATCH, dan detail tetap mengikuti refresh.
- Frontend: build dan lint lulus.
- Backend terbaru: 54 tes lulus termasuk PostgreSQL lokal terisolasi; lihat BACKEND_HANDOFF.md.
- Halaman peta diperiksa melalui browser pada lebar 320, 390, 768, 1024, dan 1366 px; beranda/login pada HP. Pengujian perangkat fisik dan seluruh halaman admin tetap diperlukan.

## Uji sebelum deploy

1. Buka halaman publik, login, dashboard, dan manajemen admin pada lebar 360, 390, 768, dan 1366 px; periksa overflow, menu, legenda, dialog, dan keyboard. Ulangi dalam ID/EN.
2. Pada HTTPS, izinkan lokasi perangkat laptop/HP dan pastikan peta memusat pada lokasi sebenarnya. Ulangi dengan izin ditolak dan GPS tidak tersedia. Di luar cakupan data, jangan menganggap peta kosong berarti jalan aman.
3. Pada lingkungan uji, ubah status: batal tidak mengirim PATCH; konfirmasi menghasilkan satu perubahan dan satu notifikasi. Uji jaringan gagal dan sesi kedaluwarsa.
4. Uji unggahan perangkat: waktu bertambah setelah batch berhasil, termasuk retry duplicate, sementara report_count tetap idempotent. Refresh halaman dan perubahan status tidak mengubah waktu alat. Batch invalid tidak menandai sinkronisasi berhasil.
5. Periksa VITE_API_URL, CORS, cookie admin, dan inisialisasi tabel pada lingkungan uji bersama pemilik deployment. Jangan mengubah produksi sebelum koordinasi hardware selesai.

Paket kiriman dan screenshot telah dihapus dengan persetujuan pengguna pada 18 November 2026. Source C3 dan frontend2 tetap dipertahankan.
