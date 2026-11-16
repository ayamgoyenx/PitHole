# Mengaktifkan nama lokasi di Railway

## Alur pengujian saat ini: pratinjau lokal dahulu

Jalankan `npm run backfill-location-names` dari direktori backend. Perintah ini sekarang **hanya membaca database** menggunakan transaksi READ ONLY, lalu menghasilkan `output/location-review/preview.md` dan `preview.json`. Semua usulan memiliki `approved: false`. Tidak ada UPDATE, migrasi, atau inisialisasi tabel yang dijalankan.

Koneksi dibaca dari `backend/.env`. Jika identitas Nominatim belum diatur, script pratinjau memakai identitas PitHole dengan URL website publik. Cache pencarian disimpan lokal agar melanjutkan pemeriksaan tidak mengulangi permintaan yang sudah berhasil.

Periksa daftar usulan sebelum menyimpan. Nama wilayah seperti Depok/Terban tidak otomatis berarti nama jalan sudah ditemukan. Tahap penyimpanan hanya akan mengubah `location_name` pada titik yang disetujui; jangan menjalankan server lokal untuk membuat preview, karena startup server memiliki alur backfill tersendiri.

Pengaturan Railway di bawah hanya dibutuhkan jika nanti mengaktifkan pengisian nama pada backend online. Tidak perlu deployment untuk membuat preview lokal ini.

## Pengaturan backend online

1. Pilih service **backend API** (domain `pithole-production.up.railway.app`), bukan frontend.
2. Pada Variables, tambahkan `NOMINATIM_USER_AGENT` dengan nilai:

   ```text
   PitHole/1.0 (+https://surprising-healing-production-fadf.up.railway.app)
   ```

   Ini identitas aplikasi, bukan API key. Boleh menyertakan email kontak tim yang benar.
3. Deploy perubahan kode backend beserta perubahan variable. Frontend perlu deployment terpisah untuk perubahan teks/fallback nama jalan.
4. Saat startup, backend yang ada menjalankan `fillMissingLocationMetadata()` untuk data lama. Tunggu log `[Geocoding] Location backfill: ... checked, ... updated.`; proses berjalan di latar belakang sementara API sudah aktif. Setiap permintaan pencarian alamat dijeda minimal satu detik.
5. Periksa `/api/v1/potholes/154`: `location_name` seharusnya terisi jika provider mengembalikan alamat. Muat ulang halaman peta/detail.

Nama dapat berupa nama wilayah apabila sumber peta tidak menyediakan nama jalan. `segment_id` tetap boleh kosong: nama alamat dari Nominatim bukan bukti bahwa titik cocok dengan ruas yang diimpor.

Jika masih kosong, periksa log `[Geocoding]`: konfigurasi belum tersedia, HTTP 403/429, atau koneksi timeout. Jangan melakukan restart berulang untuk memaksa pencarian. Pastikan hanya satu proses/replica melakukan lookup ke public Nominatim; antrean kode ini berlaku per proses. Untuk skala besar gunakan layanan geocoding yang sesuai.

Jangan menjalankan perintah seed untuk memperbaiki nama lokasi. Perintah backfill manual pada versi ini menghasilkan preview saja; tidak langsung menyimpan nama.

Kode lokal mungkin berbeda dari backend yang sekarang terdeploy. Pastikan deploy tetap mempertahankan perubahan produksi seperti penandaan `source`/`device_id` jika perubahan tersebut belum ada dalam checkout lokal ini.

Referensi: https://docs.railway.com/variables dan https://operations.osmfoundation.org/policies/nominatim/
