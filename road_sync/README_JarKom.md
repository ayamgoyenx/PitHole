# Penyimpanan dan sinkronisasi lokasi jalan rusak

Paket awal untuk STM32CubeIDE + FatFs, ESP8266 ESP-01S, dan server Python/SQLite.
SD menyimpan seluruh kejadian lokal dan seluruh kejadian server yang telah diunduh.
Buzzer berbasis GPS tetap bekerja offline. Data sepeda lain yang belum pernah
tersinkronisasi belum dapat diketahui perangkat.

## Isi

- `firmware/road_sync.c/.h`: penyimpanan kejadian, antrean upload, download, peringatan GPS.
- `firmware/road_disk_fatfs.c`: port FatFs untuk SD card.
- `firmware/integration_example.txt`: titik integrasi STM32 dan contoh UART TX interrupt.
- `esp01/esp01.ino`: firmware custom Wi-Fi/UART ESP-01S, menggantikan firmware AT.
- `server/server.py`: API lokal dengan SQLite, tanpa dependency pip.
- `tests/`: pengujian logika C dan API server.

Ini modul integrasi, bukan firmware board yang langsung dapat di-flash. Proyek
`github/PitHole/IMU/imu_STM32` menggunakan STM32F401CCU6, tetapi belum menyediakan
FatFs, driver SD, GPS, UART ESP, dan pin buzzer. File proyek IMU tersebut tidak diubah.

## Format dan alur data

Koordinat memakai integer derajat × 10^7 (contoh -7.8 menjadi -78000000), IMU peak
memakai mg, waktu memakai Unix UTC detik. `device` adalah ID unik nonzero yang
provisioning-nya harus berbeda untuk setiap sepeda; `seq` meningkat setelah append
lokal berhasil. Gunakan ID sama sesudah reboot. Setelah SD diganti/diformat, gunakan
ID perangkat baru supaya sequence yang kembali ke 1 tidak bentrok di server.

`ROAD.BIN` berisi record 40 byte dengan CRC32: LOCAL, ACK, dan REMOTE. LOCAL adalah
hasil IMU sendiri, ACK konfirmasi upload, REMOTE adalah data unduhan plus revision.
Data REMOTE tidak pernah dimasukkan antrean upload. Duplikasi lokasi LOCAL/REMOTE
boleh berada di log; cooldown buzzer mencegah bunyi ganda dalam satu pemindaian.
Server menolak ID yang sama dengan isi berbeda, dan menerima retry identik.

Setiap append diikuti `f_sync`. Pada boot, ekor record parsial dipotong; record utuh
dengan CRC salah menghentikan init, agar korupsi tidak diam-diam dianggap sukses.
Jika write gagal, hentikan akses dan lakukan recovery/remount sebelum dipakai lagi.
FatFs/SD biasa tetap tidak menjamin filesystem selamat dari pencabutan daya saat
write; CRC mendeteksi korupsi record, bukan memperbaiki filesystem.

Download satu kejadian per respons, berurutan menurut revision server. Revision dan
lokasi disimpan dalam satu record sebelum cursor RAM diperbarui. Tidak ada batas
jumlah lokasi di RAM karena lokasi dipindai langsung dari SD. Ukuran praktis dibatasi
kapasitas SD, batas file FatFs, dan waktu pemindaian.

## Menjalankan server lokal

```bash
cd /home/shane/Capstone/road_sync
export ROAD_API_TOKEN='ganti-dengan-token-rahasia-minimal-16-karakter'
python3 server/server.py --host 0.0.0.0 --port 8080 --db /tmp/road.db
```

Laptop dan ESP berada di jaringan Wi-Fi yang sama. Catat IP LAN laptop. API:

- `POST /events`: JSON integer `device,seq,utc,lat_e7,lon_e7,peak_mg` → `ACK device seq`.
- `GET /changes?after=revision`: → `ROW revision device seq utc lat_e7 lon_e7 peak_mg`, atau `EMPTY`.
- Header keduanya: `Authorization: Bearer TOKEN`.

Server ini HTTP untuk prototipe LAN. Untuk server internet, tambahkan HTTPS dengan
validasi sertifikat pada ESP, kredensial per perangkat, dan deployment server yang
sesuai. Jangan mengekspos server HTTP/token bersama ini langsung ke internet.
Pertahankan database server: penghapusan/reset revision memerlukan reset cache/cursor
perangkat secara terkoordinasi.

## Menyiapkan ESP-01S

1. Salin `esp01/secrets.example.h` menjadi `esp01/secrets.h`, isi Wi-Fi, IP server, token.
2. Buka sketch menggunakan Arduino IDE dengan ESP8266 Arduino core. Pilih board ESP8266
   yang sesuai ESP-01S dan kapasitas flash aktual, lalu upload memakai USB-to-UART.
3. Hubungkan ESP TX → STM32 RX dan ESP RX ← STM32 TX pada UART khusus 115200 8N1.
4. Gunakan logika 3.3 V, ground bersama, suplai ESP stabil sesuai spesifikasi modul,
   serta konfigurasi boot normal ESP. Jangan menggunakan pin UART ini untuk debug.

ESP menerima satu perintah setiap kali, STM32 menunggu respons/timeout sebelum
perintah berikutnya. ESP melakukan HTTP blocking, sedangkan STM32 tidak menunggu
jaringan dengan HAL_Delay. Timeout STM32 12 detik; retry 15 detik dan polling idle
30 detik. Respons terlambat upload diverifikasi terhadap ID kejadian yang ditunggu.

## Mengintegrasikan STM32CubeIDE

1. Pastikan tipe MCU aktual. Aktifkan SPI untuk SD, UART GPS, UART ESP, dan GPIO buzzer
   melalui CubeMX. Pilih pin berdasarkan wiring aktual dan konflik peripheral.
2. Aktifkan middleware FatFs. Implementasikan driver kartu SD SPI pada lapisan
   `diskio`/`user_diskio` (initialize, read, write, ioctl), atau gunakan driver SD yang
   sudah teruji. Mengaktifkan FatFs saja belum membuat SD SPI berfungsi.
3. Tambahkan `road_sync.c` dan `road_disk_fatfs.c` ke source proyek, serta header ke
   include path. Link math library `m` bila linker belum mengaktifkannya.
4. Mount FatFs lalu panggil `road_init`, periksa hasil. Lihat `integration_example.txt`.
5. Implementasikan `road_uart_send`, UART RX ring buffer, perakitan baris, dan recovery
   error UART. Jangan mengakses SD di ISR. Jalankan semua API road dari satu konteks.
6. Hubungkan hasil parser GPS (fix, usia data, UTC, koordinat, speed dan course) dan
   keluaran algoritma deteksi IMU ke fungsi dalam contoh. Driver/parser GPS dan
   algoritma penentuan jalan rusak tidak disertakan dalam paket tugas penyimpanan ini.
7. Saat peringatan lokasi true, nyalakan buzzer menggunakan timer; hasil vision boleh
   menyalakan buzzer melalui pengendali yang sama tanpa mencatat kejadian ke database.

`road_log_imu` menyimpan kejadian yang memiliki fix GPS valid. Jika GPS belum valid,
fungsi mengembalikan false dan kejadian tidak disimpan: aplikasi perlu menampilkan
status tersebut atau menambahkan log sampel IMU terpisah tanpa koordinat. Jangan
menganggap false sebagai keberhasilan. Penyimpanan di sini adalah kejadian deteksi,
bukan semua sampel mentah IMU.

## Peringatan offline

Panggil hanya untuk fix GPS fresh dan course valid. Default: jarak 3–25 meter,
selisih arah maksimum 40°, kecepatan minimum 1.5 m/s, cooldown global 10 detik.
Arah utara 0°, timur 90°. Jarak menggunakan pendekatan bidang lokal untuk tetangga
dekat. Toleransi perlu diuji terhadap GPS dan kecepatan sepeda. Ini belum melakukan
map matching atau pemeriksaan penurunan jarak antar-fix; jalan paralel dan noise GPS
masih bisa menghasilkan peringatan keliru. Cooldown global dapat menunda lubang kedua
jika lokasinya berdekatan.

Versi ini menyinkronkan seluruh kejadian secara append-only: belum menggabungkan
laporan lubang sama, belum mendukung penghapusan/perbaikan lokasi. Semua lokasi yang
pernah diunduh tetap disimpan. Pemindaian SD bersifat sinkron dan pencarian ACK
bersifat kuadratik terhadap ukuran log; untuk data besar, tambahkan indeks spasial,
indeks ACK dan scan bertahap pada task berprioritas rendah setelah profiling.
Jangan menganggap waktu loop sensor real-time terjamin dengan pemindaian ini.

## Pengujian

```bash
gcc -std=c11 -Wall -Wextra -Werror -fsanitize=address,undefined \
  -Ifirmware firmware/road_sync.c tests/test_core.c -lm -o /tmp/road_sync_test
ASAN_OPTIONS=detect_leaks=0 /tmp/road_sync_test
python3 -m unittest discover -s tests -v
```

Uji perangkat: simpan kejadian tanpa Wi-Fi → reboot → pastikan antrean masih ada;
aktifkan server → sinkronkan dua perangkat dengan ID berbeda → matikan Wi-Fi →
pastikan perangkat kedua memberi peringatan berdasarkan lokasi unduhan. Cabut
koneksi saat upload untuk memeriksa retry tanpa duplikasi. Uji SD penuh dan kegagalan
write. Hardware STM32/ESP/SD serta firmware ESP belum diverifikasi melalui flash
perangkat oleh pengujian host.
