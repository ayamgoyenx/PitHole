#ifndef ROAD_SYNC_H
#define ROAD_SYNC_H
#include <stdint.h>
#include <stdbool.h>
/* Semua fungsi dipanggil dari satu task/main loop, bukan ISR. */
typedef struct {
    uint32_t device, seq, utc;
    int32_t lat_e7, lon_e7, peak_mg;
} RoadEvent;
typedef struct {
    uint32_t magic, kind, revision;
    RoadEvent event;
    uint32_t crc;
} RoadRecord;
typedef struct {
    uint32_t device, seq, cursor, deadline, retry_at, last_alarm;
    bool waiting, downloading, alarm_seen;
    RoadEvent pending;
} RoadSync;
/* Port SD: read: 1=record, 0=EOF, -1=error. append wajib durable.
   open wajib memotong ekor record parsial setelah listrik terputus. */
int road_disk_open(void);
int road_disk_read(uint32_t index, RoadRecord *record);
int road_disk_append(const RoadRecord *record);
/* Mengantre satu baris UART; false bila antrean penuh. */
bool road_uart_send(const char *line);
bool road_init(RoadSync *s, uint32_t unique_device_id);
bool road_log_imu(RoadSync *s, uint32_t utc, int32_t lat_e7,
                  int32_t lon_e7, int32_t peak_mg, bool gps_valid);
void road_tick(RoadSync *s, uint32_t now_ms);
/* Baris lengkap tanpa CR/LF; panggil di main, bukan callback interrupt. */
void road_receive(RoadSync *s, const char *line, uint32_t now_ms);
/* GPS harus fresh dan valid; course dari GPS dalam derajat, speed m/s. */
bool road_warning(RoadSync *s, int32_t lat_e7, int32_t lon_e7,
                  float course_deg, float speed_mps, uint32_t now_ms);
#endif
