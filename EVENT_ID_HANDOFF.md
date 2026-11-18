# Perbaikan event_id dan respons duplicate — 17 November 2026

Status: perubahan lokal saja. Tidak ada push, deploy Railway, migrasi produksi, atau flash perangkat.

## File untuk direview

- `backend/src/db.js`: helper transaksi satu koneksi, READ COMMITTED, rollback dan release.
- `backend/src/services/potholeService.js`: claim event sebelum mutasi; claim, perubahan pothole, dan tautan ID di-commit bersama. Geocoding dan pin turunan diproses setelah commit.
- `backend/src/services/roadService.js`: lookup jalan dapat memakai koneksi transaksi yang sama.
- `backend/index.js`: respons validasi 400 dan database belum siap 503 diteruskan oleh endpoint upload.
- `backend/tests/eventId.integration.test.js`: integration test opt-in pada PostgreSQL/PostGIS lokal terisolasi.
- `hardware/pithole_c3_event_id/pithole_c3_event_id.ino`: salinan dari file pengguna `pithole_c3_terbaru.ino`, dengan dua tambahan baris untuk filter JSON dan fallback pembacaan `pothole_id`. File asli Downloads tidak diubah.

## Kontrak backend/C3

Rumus event_id pada C3 tidak berubah. Gunakan DEVICE_ID yang unik per alat, serta tanggal/jam/koordinat asli yang sama pada setiap retry.

Respons duplikat tetap kompatibel:

```json
{"action":"duplicate","event_id":"SEPEDA01-...","pothole_id":154}
```

Created/updated tetap memakai `pothole.id`. C3 sekarang memfilter kedua field dan membaca `pothole_id` ketika `pothole.id` tidak tersedia/valid. `id_ingat()` tetap menyimpan ID positif ke Preferences. Format balasan UART `OK,n,baru,gabung` tidak berubah.

Setiap event memakai satu transaksi (bukan seluruh batch). Jika salah satu event gagal saat DB bekerja, event sebelumnya bisa sudah commit; kirim ulang batch dengan ID asli akan mengembalikan duplicate untuk bagian yang sudah selesai. Validasi bentuk item, ID, koordinat dan waktu event dilakukan sebelum penulisan batch.

Saat DB belum siap, batch ber-event_id mendapat 503, bukan success melalui penyimpanan RAM. C3 mempertahankan antrean pada respons non-200 sesuai kode yang sudah ada.

Tidak ada migrasi baru untuk skema yang sebelumnya sudah memiliki `pothole_events(event_id VARCHAR(80) PRIMARY KEY, pothole_id REFERENCES potholes(id))`. `initDb()` yang sudah ada membuat tabel tersebut bila belum ada. Jangan menjalankan seed/reset sebagai bagian dari perubahan ini.

## Hasil uji backend

PostgreSQL 17 dengan PostGIS pada cluster sementara localhost: **27 tes lulus** (16 tes lama, 10 skenario integration, dan satu parent test). Database uji sudah dihentikan.

- 12 request serentak event sama: satu create, 11 duplicate, report_count 1.
- 12 retry pada lubang yang sudah ada: count hanya bertambah sekali.
- Retry berurutan dan duplikat dalam satu batch mengembalikan pothole_id asli.
- Gagal menghubungkan event setelah UPDATE: increment dan claim rollback; retry berhasil.
- Gagal menghubungkan event setelah INSERT: lubang baru dan claim rollback.
- Kegagalan setelah commit: retry mengembalikan duplicate tanpa menaikkan count.
- ID invalid/lebih dari 80 karakter, item null, koordinat/waktu event invalid ditolak sebelum mutasi.
- ID 80 karakter diterima.
- Request legacy tanpa event_id mempertahankan perilaku lama (belum idempoten).
- DB belum siap: upload ber-event_id ditolak dengan 503.

Tes integration tidak membaca `.env`/DB_URL. Untuk menjalankannya, siapkan cluster uji khusus pada loopback dengan user `pithole_test`, database `postgres`, dan PostGIS, lalu jalankan dari `backend`:

```powershell
$env:PITHOLE_EVENT_TEST_PORT='55439'
node --test tests/*.test.js
```

Tanpa variabel tersebut, integration test di-skip. Tes membuat schema unik lalu menghapus schema uji tersebut. Jangan arahkan ke database operasional.

## Catatan integrasi ke fork teman

Working tree lokal yang diubah adalah `D:/PitHole` (basis commit `503a03f`). Fork audit sebelumnya memiliki konfigurasi deployment/CORS/cookie/API URL tambahan. Integrasikan perubahan fungsi yang terkait atau gunakan patch; jangan mengganti seluruh `backend/index.js` fork dengan versi lokal sehingga konfigurasi deployment teman hilang.

Patch dan paket kiriman lama sudah dihapus atas persetujuan pengguna pada 18 November 2026. Gunakan source backend, migrasi, dan tes terbaru. Source C3 tetap tersedia di folder hardware.

Pembacaan respons C3 diuji dengan ArduinoJson 7.4.3 pada program C++ lokal yang mengambil filter dan ekstraksi ID langsung dari sketch: created → 154, updated → 155, duplicate → 156, ID null → 0. Semua pemeriksaan lulus. Uji ini belum menggantikan pemeriksaan UART/Preferences pada perangkat fisik.

Kompilasi firmware penuh juga **berhasil**, memakai ESP32 core 3.3.11, ArduinoJson 7.4.3, dan FQBN `esp32:esp32:esp32c3:CDCOnBoot=cdc`. Ukuran sketch 1.191.859 byte (90% partisi aplikasi default); variabel global 41.664 byte (12% RAM). Build berada di `D:/simulasi-pothole/tmp/pithole-event-build/build`. Tidak dilakukan upload/flash. Ruang partisi aplikasi tersisa terbatas untuk penambahan fitur berikutnya; gunakan pengaturan board/partisi yang sesuai perangkat tim hardware.

## Uji hardware bersama teman sebelum deploy

1. Pilih satu catatan CSV bertanggal/jam GPS valid dan pastikan event_id stabil setelah reset.
2. Kirim pertama kali, lalu kirim catatan identik: count hanya naik sekali.
3. Simulasikan respons pertama terputus setelah server commit: retry duplicate harus tetap memasukkan ID positif ke `ID?`.
4. Reset C3 sebelum upload selesai: STM32 harus masih punya CSV asli dan mengirim ulang sampai mendapat konfirmasi sukses.
5. Saat DB unavailable/HTTP non-200, antrean tidak boleh dianggap selesai oleh STM32.

Perubahan ini tidak mengatasi autentikasi perangkat, deduplikasi spasial antara event berbeda yang datang serentak, status in_progress, cursor sync, atau masalah audit lainnya. Request dua kolom tanpa waktu/event_id masih memiliki perilaku lama. Pemeriksaan firmware fisik dan alur CSV STM32 masih perlu dilakukan bersama tim hardware.
