#include "road_sync.h"
#include "ff.h"
/* FatFs sudah di-mount oleh aplikasi. Satu file; jangan akses dari ISR/task lain. */
static FIL journal;
static int failed;
int road_disk_open(void) {
    failed=0;
    if(f_open(&journal,"0:/ROAD.BIN",FA_OPEN_ALWAYS|FA_READ|FA_WRITE)!=FR_OK) return -1;
    FSIZE_t size=f_size(&journal), whole=size-size%sizeof(RoadRecord);
    /* Recovery hanya ekor parsial. CRC record utuh diperiksa road_init. */
    if(size!=whole && (f_lseek(&journal,whole)!=FR_OK || f_truncate(&journal)!=FR_OK || f_sync(&journal)!=FR_OK)) return -1;
    return 0;
}
int road_disk_read(uint32_t index,RoadRecord *r) {
    if(failed) return -1;
    FSIZE_t offset=(FSIZE_t)index*sizeof(*r);
    if(offset>=f_size(&journal)) return 0;
    UINT count;
    if(f_lseek(&journal,offset)!=FR_OK || f_read(&journal,r,sizeof(*r),&count)!=FR_OK || count!=sizeof(*r)) return -1;
    return 1;
}
int road_disk_append(const RoadRecord *r) {
    if(failed) return -1;
    UINT count;
    if(f_lseek(&journal,f_size(&journal))!=FR_OK || f_write(&journal,r,sizeof(*r),&count)!=FR_OK || count!=sizeof(*r) || f_sync(&journal)!=FR_OK) {
        failed=1;return -1; /* Hentikan append hingga remount/recovery. */
    }
    return 0;
}
