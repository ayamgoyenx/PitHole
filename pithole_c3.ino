// pithole_c3.ino -- ESP32-C3 Super Mini sebagai "modul internet" alat PitHole.
//
//   STM32 --UART (C3 pin 20 = RX, pin 21 = TX)--> ESP32-C3 --WiFi HTTPS--> backend PitHole
//
// Perintah (satu baris teks, diakhiri Enter). Bisa juga diketik manual di Serial Monitor USB
// untuk uji tanpa STM32 -- balasan dikirim ke port asal perintah.
//   PING                                       -> PONG,<wifi 1/0>,<rssi>,<antre>
//   LUBANG,<tgl>,<jam>,<lat_mikro>,<lon_mikro> -> TERIMA,<antre>     (masuk antrean, belum dikirim)
//   KIRIM                                      -> OK,<n>,<baru>,<gabung> | GAGAL,<alasan>
//   BATAL                                      -> TERIMA,0           (kosongkan antrean)
//   DB?                                        -> id,lat_mikro,lon_mikro,status / baris... / VERSI,<epoch>
//                                                 | GAGAL,<alasan>      (status: baru | resolved)
//   ID?                                        -> daftar id lubang yang pernah dikirim alat ini
//   LUPA                                       -> hapus daftar id (lakukan sebelum uji 3 putaran yang baru)
//
// Tools: Board "ESP32C3 Dev Module", USB CDC On Boot: Enabled.
// Library: ArduinoJson (Benoit Blanchon) versi 7 -- pasang dari Library Manager.
#include <WiFi.h>
#include <WiFiMulti.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <stdarg.h>

// ======================= PENGATURAN =======================
const char* BACKEND   = "https://pithole-production.up.railway.app";
const char* DEVICE_ID = "SEPEDA01";
const char* DEVICE_KEY = "";          // isi kalau backend sudah memakai API key (header X-Device-Key)
// MODE_UJI true  = alat hanya memakai lubang yang PERNAH DIKIRIM ALAT INI (id-nya diingat di
//                  memori C3, tidak hilang walau dimatikan), untuk uji 3 putaran
// MODE_UJI false = semua lubang di database (untuk expo / pemakaian biasa)
const bool MODE_UJI = true;
// WiFi: dari daftar ini, yang sinyalnya PALING KUAT yang dipakai (bukan urutan).
struct { const char* ssid; const char* pass; } DAFTAR_WIFI[] = {
  {"UGM-Guest", "ugmjaya0423"},
  {"isti",      "12345678"},     // cadangan: hotspot HP
};
// ==========================================================

#define PIN_RX   20
#define PIN_TX   21
#define PIN_LED  8          // LED biru Super Mini (nyala = LOW): nyala = WiFi tersambung
#define MAKS_ANTRE 20

WiFiMulti wifiMulti;
Preferences mem;

// ---------- id lubang milik alat ini (MODE_UJI) ----------
// Backend MENGGABUNG laporan < 3 m dan menggeser koordinatnya (rata-rata), jadi koordinat di
// database tidak sama persis dengan yang dikirim. Id-nya tetap -> pencocokan pakai id.
#define MAKS_ID 300
int32_t id_alat[MAKS_ID];
int n_id = 0;

void id_muat() {
  n_id = mem.getBytes("ids", id_alat, sizeof id_alat) / sizeof(int32_t);
}
bool id_kenal(int32_t id) {
  for (int i = 0; i < n_id; i++) if (id_alat[i] == id) return true;
  return false;
}
void id_ingat(int32_t id) {
  if (id <= 0 || id_kenal(id)) return;
  if (n_id >= MAKS_ID) { memmove(id_alat, id_alat + 1, (MAKS_ID - 1) * sizeof(int32_t)); n_id--; }
  id_alat[n_id++] = id;
  mem.putBytes("ids", id_alat, n_id * sizeof(int32_t));
}
// event_id = tanda unik SATU lubang, dibuat dari ISI catatannya (alat-tanggal-jam GPS-lat-lon),
// contoh "SEPEDA01-2026-11-15-09:37:29.00--7766452-110374747".
// Karena isinya sama setiap kali STM32 mengirim ulang baris yang sama dari LBARU.CSV, event_id-nya
// juga sama -> backend bisa mengenali kiriman ulang (idempotency) dan tidak menaikkan report_count dua kali.
// Tidak memakai millis()/nomor antrean: keduanya berubah saat dikirim ulang dan berulang setelah C3 restart.
struct Lubang { char tgl[12]; char jam[14]; long lat, lon; char eid[64]; };
Lubang antre[MAKS_ANTRE];
int n_antre = 0;

// ---------- utilitas ----------
void lapor(const char* fmt, ...) {          // catatan untuk dilihat di Serial Monitor USB
  char b[200];
  va_list a; va_start(a, fmt); vsnprintf(b, sizeof b, fmt, a); va_end(a);
  Serial.print("[C3] "); Serial.println(b);
}

// "2026-10-28T06:52:25..." -> detik sejak 1970 (UTC)
long iso_ke_epoch(const char* s) {
  int y, mo, d, h, mi, se;
  if (!s || sscanf(s, "%d-%d-%dT%d:%d:%d", &y, &mo, &d, &h, &mi, &se) != 6) return 0;
  y -= mo <= 2;
  long era = (y >= 0 ? y : y - 399) / 400;
  long yoe = y - era * 400;
  long doy = (153 * (mo + (mo > 2 ? -3 : 9)) + 2) / 5 + d - 1;
  long doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  long hari = era * 146097 + doe - 719468;
  return hari * 86400L + h * 3600L + mi * 60L + se;
}

bool siapkan_http(HTTPClient& http, WiFiClientSecure& tls, const String& url) {
  tls.setInsecure();                        // tanpa cek sertifikat (cukup untuk prototipe)
  tls.setHandshakeTimeout(15);              // jabat tangan HTTPS boleh sampai 15 s (hotspot kadang lambat)
  http.setConnectTimeout(15000);            // bawaan hanya 5 s -> sering "connection refused"
  http.setTimeout(20000);
  http.useHTTP10(true);                     // balasan berakhir saat koneksi ditutup (mudah dibaca bertahap)
  if (!http.begin(tls, url)) return false;
  if (DEVICE_KEY[0]) http.addHeader("X-Device-Key", DEVICE_KEY);
  return true;
}

// ---------- perintah ----------
void cmd_ping(Stream& out) {
  out.printf("PONG,%d,%d,%d\n", WiFi.status() == WL_CONNECTED ? 1 : 0,
             WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0, n_antre);
}

// arg = "tgl,jam,lat_mikro,lon_mikro"  atau cukup "lat_mikro,lon_mikro" (waktu diisi backend).
// Pemisah boleh koma, spasi, atau titik koma.
void cmd_lubang(Stream& out, char* arg) {
  if (n_antre >= MAKS_ANTRE) { out.println("GAGAL,antrean penuh"); return; }
  char asli[100];
  strlcpy(asli, arg, sizeof asli);
  char* p[4];
  int k = 0;
  for (char* t = strtok(arg, ", ;\t"); t && k < 4; t = strtok(NULL, ", ;\t")) p[k++] = t;
  Lubang& L = antre[n_antre];
  if (k == 4) {
    strlcpy(L.tgl, p[0], sizeof L.tgl);
    strlcpy(L.jam, p[1], sizeof L.jam);
    L.lat = atol(p[2]); L.lon = atol(p[3]);
  } else if (k == 2) {
    L.tgl[0] = 0; L.jam[0] = 0;
    L.lat = atol(p[0]); L.lon = atol(p[1]);
  } else {
    out.printf("GAGAL,format LUBANG salah (diterima: \"%s\"). Contoh: LUBANG,2026-10-28,07:15:32,-7771300,110377600\n", asli);
    return;
  }
  if (L.lat == 0 || L.lon == 0 || labs(L.lat) > 90000000L || labs(L.lon) > 180000000L) {
    out.println("GAGAL,koordinat tidak masuk akal (pakai mikroderajat, mis. -7771300)");
    return;
  }
  // event_id hanya bila tanggal & jam ada (format 4 kolom). Format 2 kolom (tanpa waktu) tidak punya
  // isi yang unik -> dikirim tanpa event_id, backend memperlakukannya seperti dulu.
  if (L.tgl[0] && L.jam[0])
    snprintf(L.eid, sizeof L.eid, "%s-%s-%s-%ld-%ld", DEVICE_ID, L.tgl, L.jam, L.lat, L.lon);
  else
    L.eid[0] = 0;
  // baris yang sama sudah ada di antrean (STM32 mengirim ulang sebelum antrean sempat terkirim):
  // jangan dimasukkan dua kali
  if (L.eid[0])
    for (int i = 0; i < n_antre; i++)
      if (!strcmp(antre[i].eid, L.eid)) { out.printf("TERIMA,%d\n", n_antre); return; }
  n_antre++;
  out.printf("TERIMA,%d\n", n_antre);
}

void cmd_kirim(Stream& out) {
  if (n_antre == 0) { out.println("OK,0,0,0"); return; }
  if (WiFi.status() != WL_CONNECTED) { out.println("GAGAL,wifi belum tersambung"); return; }

  // susun JSON sesuai backend: {"device_id":..,"potholes":[{"lat":..,"lon":..,"detected_at":..}]}
  JsonDocument doc;
  doc["device_id"] = DEVICE_ID;
  JsonArray arr = doc["potholes"].to<JsonArray>();
  for (int i = 0; i < n_antre; i++) {
    JsonObject o = arr.add<JsonObject>();
    o["lat"] = serialized(String(antre[i].lat / 1e6, 6));
    o["lon"] = serialized(String(antre[i].lon / 1e6, 6));
    if (antre[i].eid[0]) o["event_id"] = antre[i].eid;   // tanda unik lubang (idempotency)
    // waktu dari GPS; "2026-01-01" = lubang uji tanpa GPS -> biarkan backend memakai waktu server
    if (strlen(antre[i].tgl) == 10 && strncmp(antre[i].tgl, "2026-01-01", 10) != 0 && strlen(antre[i].jam) >= 8) {
      char t[32];
      snprintf(t, sizeof t, "%sT%.8sZ", antre[i].tgl, antre[i].jam);   // jam dipotong ke detik
      o["detected_at"] = t;
    }
  }
  String badan;
  serializeJson(doc, badan);

  WiFiClientSecure tls;
  HTTPClient http;
  uint32_t t0 = millis();
  int kode = -1;
  for (int coba = 1; coba <= 3; coba++) {            // gagal SEBELUM terkirim (kode < 0): aman dicoba ulang
    if (!siapkan_http(http, tls, String(BACKEND) + "/api/v1/potholes/batch-upload")) { out.println("GAGAL,http.begin"); return; }
    http.addHeader("Content-Type", "application/json");
    kode = http.POST(badan);
    if (kode != HTTPC_ERROR_CONNECTION_REFUSED) break;   // hanya ulangi kalau koneksi belum terbentuk
    lapor("KIRIM percobaan %d: koneksi gagal", coba);
    http.end();
    delay(1000);
  }
  if (kode != 200) {
    String isi = kode > 0 ? http.getString().substring(0, 80) : http.errorToString(kode);
    isi.replace("\n", " ");
    out.printf("GAGAL,http %d %s\n", kode, isi.c_str());
    lapor("kirim GAGAL http %d: %s", kode, isi.c_str());
    http.end();
    return;                                  // antrean tidak dihapus: STM32 akan mengirim ulang
  }
  JsonDocument saring, hasil;               // ambil hanya yang perlu dari balasan
  saring["status"] = true;
  saring["details"][0]["action"] = true;
  saring["details"][0]["pothole"]["id"] = true;
  DeserializationError e = deserializeJson(hasil, http.getStream(), DeserializationOption::Filter(saring));
  http.end();
  if (e || strcmp(hasil["status"] | "", "success") != 0) {
    out.printf("GAGAL,balasan backend tidak dikenal (%s)\n", e ? e.c_str() : "status bukan success");
    return;
  }
  int baru = 0, gabung = 0, ulang = 0;
  for (JsonObject d : hasil["details"].as<JsonArray>()) {
    const char* a = d["action"] | "";
    if (!strcmp(a, "created")) baru++;
    else if (!strcmp(a, "updated")) gabung++;
    else if (!strcmp(a, "duplicate")) ulang++;          // event_id sudah pernah diterima: kiriman ulang, tidak dihitung lagi
    int32_t id = d["pothole"]["id"] | 0;
    id_ingat(id);                            // dibuat ATAU digabung: lubang ini pernah dideteksi alat
    lapor("  %s id=%d", a, (int)id);
  }
  lapor("kirim %d lubang OK (%d baru, %d digabung, %d kiriman ulang) %lu ms", n_antre, baru, gabung, ulang, millis() - t0);
  out.printf("OK,%d,%d,%d\n", n_antre, baru, gabung);
  n_antre = 0;
}

void cmd_db(Stream& out) {
  if (WiFi.status() != WL_CONNECTED) { out.println("GAGAL,wifi belum tersambung"); return; }
  WiFiClientSecure tls;
  HTTPClient http;
  uint32_t t0 = millis();
  int kode = -1;
  for (int coba = 1; coba <= 3; coba++) {            // koneksi pertama kadang gagal: coba sampai 3 kali
    if (!siapkan_http(http, tls, String(BACKEND) + "/api/v1/potholes/sync")) { out.println("GAGAL,http.begin"); return; }
    kode = http.GET();
    if (kode > 0) break;
    lapor("DB? percobaan %d gagal: %s", coba, http.errorToString(kode).c_str());
    http.end();
    delay(1000);
  }
  if (kode != 200) {
    out.printf("GAGAL,http %d %s\n", kode, kode < 0 ? http.errorToString(kode).c_str() : "");
    http.end();
    return;
  }
  // balasan ±160 KB: dibaca bertahap, hanya kolom yang perlu disimpan di RAM
  JsonDocument saring, doc;
  saring["sync_time"] = true;
  JsonObject s = saring["potholes"][0].to<JsonObject>();
  s["id"] = true; s["lat"] = true; s["lon"] = true; s["status"] = true; s["source"] = true;
  DeserializationError e = deserializeJson(doc, http.getStream(), DeserializationOption::Filter(saring));
  http.end();
  if (e) { out.printf("GAGAL,json %s\n", e.c_str()); return; }

  out.println("id,lat_mikro,lon_mikro,status");
  int n = 0, semua = 0;
  for (JsonObject p : doc["potholes"].as<JsonArray>()) {
    semua++;
    int32_t id = p["id"] | 0;
    const char* st = p["status"] | "active";
    const char* src = p["source"] | "";
    if (MODE_UJI && !id_kenal(id) && strncmp(src, "alat:", 5) != 0) continue;   // mode uji: hanya lubang alat ini
    // Lubang yang sudah diperbaiki TETAP dikirim dengan status "resolved": STM32 tidak membunyikannya
    // dan tidak memakai salinan lokalnya (LBARU.CSV) untuk lubang itu.
    bool beres = !strcmp(st, "repaired") || !strcmp(st, "resolved") || !strcmp(st, "fixed");
    out.printf("%d,%ld,%ld,%s\n", (int)id,
               lround((double)(p["lat"] | 0.0) * 1e6), lround((double)(p["lon"] | 0.0) * 1e6),
               beres ? "resolved" : "baru");
    if (++n % 32 == 0) delay(20);           // beri waktu STM32 menulis kartu SD
  }
  out.printf("VERSI,%ld\n", iso_ke_epoch(doc["sync_time"] | ""));
  lapor("database: %d dari %d lubang dikirim ke STM32 (MODE_UJI %d), %lu ms, RAM bebas %u",
        n, semua, MODE_UJI, millis() - t0, ESP.getFreeHeap());
}

void jalankan(Stream& out, char* b) {
  while (*b == ' ') b++;                                       // buang spasi di depan
  for (char* c = b; *c && *c != ',' && *c != ' '; c++) *c = toupper(*c);   // "ping" = "PING"
  for (int n = strlen(b); n > 0 && b[n - 1] == ' '; n--) b[n - 1] = 0;    // buang spasi di belakang
  if (!strcmp(b, "PING")) cmd_ping(out);
  else if (!strncmp(b, "LUBANG", 6) && (b[6] == ',' || b[6] == ' ')) cmd_lubang(out, b + 7);
  else if (!strcmp(b, "KIRIM")) cmd_kirim(out);
  else if (!strcmp(b, "BATAL")) { n_antre = 0; out.println("TERIMA,0"); }
  else if (!strcmp(b, "DB?")) cmd_db(out);
  else if (!strcmp(b, "ID?")) {
    out.printf("ID,%d:", n_id);
    for (int i = 0; i < n_id; i++) out.printf(" %ld", (long)id_alat[i]);
    out.println();
  }
  else if (!strcmp(b, "LUPA")) { n_id = 0; mem.remove("ids"); out.println("ID,0"); }
  else if (b[0]) out.printf("GAGAL,perintah tidak dikenal: %s\n", b);
}

// pembaca baris untuk satu port
struct Pembaca {
  char b[128]; int n = 0;
  void layani(Stream& s) {
    while (s.available()) {
      char c = s.read();
      if (c == '\r') continue;
      if (c == '\n') { b[n] = 0; n = 0; jalankan(s, b); }
      else if (n < (int)sizeof(b) - 1) b[n++] = c;
    }
  }
};
Pembaca dari_stm32, dari_usb;

void setup() {
  Serial.begin(115200);                                   // USB: catatan + uji manual
  Serial1.begin(115200, SERIAL_8N1, PIN_RX, PIN_TX);      // ke STM32
  mem.begin("pithole", false);
  id_muat();
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, HIGH);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);                     // radio tidak "tidur" di sela paket: koneksi HTTPS lebih stabil
  // ESP32-C3 Super Mini: antena kecil + daya pancar penuh sering membuat koneksi putus-putus.
  // Daya pancar diturunkan (masalah yang banyak dilaporkan pada board ini).
  WiFi.setTxPower(WIFI_POWER_8_5dBm);
  for (auto& w : DAFTAR_WIFI) wifiMulti.addAP(w.ssid, w.pass);
  delay(1500);
  lapor("PitHole C3 siap. Contoh perintah:");
  lapor("  PING");
  lapor("  DB?     ID?     LUPA");
  lapor("MODE_UJI %d, %d id lubang alat diingat", MODE_UJI, n_id);
  lapor("  LUBANG,2026-10-28,07:15:32,-7771300,110377600   lalu   KIRIM");
}

void loop() {
  static uint32_t t_coba = 0;
  static bool tersambung = false;
  if (WiFi.status() != WL_CONNECTED && (t_coba == 0 || millis() - t_coba > 10000)) {
    t_coba = millis();
    wifiMulti.run(4000);                    // coba sambung (maks. 4 detik), lalu ulangi tiap 10 detik
  }
  bool s = WiFi.status() == WL_CONNECTED;
  if (s != tersambung) {
    tersambung = s;
    digitalWrite(PIN_LED, s ? LOW : HIGH);
    if (s) {
      WiFi.setTxPower(WIFI_POWER_8_5dBm);   // pastikan tetap rendah setelah tersambung
      lapor("WiFi tersambung: %s, IP %s, %d dBm", WiFi.SSID().c_str(), WiFi.localIP().toString().c_str(), WiFi.RSSI());
    }
    else lapor("WiFi terputus");
  }
  dari_stm32.layani(Serial1);
  dari_usb.layani(Serial);
}
