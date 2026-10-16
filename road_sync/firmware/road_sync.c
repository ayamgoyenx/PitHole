#include "road_sync.h"
#include <string.h>
#include <stdio.h>
#include <stddef.h>
#include <math.h>
#include <limits.h>
#define MAGIC 0x524F4144u
#define LOCAL 1u
#define ACK 2u
#define REMOTE 3u
_Static_assert(sizeof(RoadRecord)==40, "Unexpected record layout");
static uint32_t checksum(const RoadRecord *r) {
    const unsigned char *p=(const unsigned char *)r;
    uint32_t c=0xffffffffu;
    for (size_t i=0;i<offsetof(RoadRecord,crc);i++) {
        c^=p[i];
        for(int b=0;b<8;b++) c=(c>>1)^((0u-(c&1u))&0xedb88320u);
    }
    return ~c;
}
static int read_record(uint32_t i, RoadRecord *r) {
    int n=road_disk_read(i,r);
    if(n==1 && (r->magic!=MAGIC || r->kind<LOCAL || r->kind>REMOTE || r->crc!=checksum(r))) return -1;
    return n;
}
static bool save(uint32_t kind,uint32_t rev,const RoadEvent *e) {
    RoadRecord r={0}; r.magic=MAGIC;r.kind=kind;r.revision=rev;r.event=*e;
    r.crc=checksum(&r);return road_disk_append(&r)==0;
}
static bool coordinates(int32_t lat,int32_t lon) {
    return lat>=-900000000 && lat<=900000000 && lon>=-1800000000 && lon<=1800000000;
}
bool road_init(RoadSync *s,uint32_t id) {
    memset(s,0,sizeof(*s));s->device=id;
    if(!id || road_disk_open()!=0) return false;
    RoadRecord r;int n;
    for(uint32_t i=0;(n=read_record(i,&r))==1;i++) {
        if(r.kind==LOCAL && r.event.device==id && r.event.seq>s->seq) s->seq=r.event.seq;
        if(r.kind==REMOTE && r.revision>s->cursor) s->cursor=r.revision;
    }
    return n==0;
}
bool road_log_imu(RoadSync *s,uint32_t utc,int32_t lat,int32_t lon,int32_t peak,bool valid) {
    if(!valid || !coordinates(lat,lon) || s->seq==UINT32_MAX || peak<0) return false;
    RoadEvent e={s->device,s->seq+1,utc,lat,lon,peak};
    if(!save(LOCAL,0,&e)) return false;
    s->seq++;return true;
}
static int pending(RoadEvent *e) {
    RoadRecord r,a;int n;
    for(uint32_t i=0;(n=read_record(i,&r))==1;i++) {
        if(r.kind!=LOCAL) continue;
        bool ack=false;int m;
        for(uint32_t j=0;(m=read_record(j,&a))==1;j++)
            if(a.kind==ACK && a.event.device==r.event.device && a.event.seq==r.event.seq) {ack=true;break;}
        if(m<0) return -1;
        if(!ack) {*e=r.event;return 1;}
    }
    return n;
}
void road_tick(RoadSync *s,uint32_t now) {
    if(s->waiting) {
        if((int32_t)(now-s->deadline)<0) return;
        s->waiting=false;s->retry_at=now+15000;return;
    }
    if((int32_t)(now-s->retry_at)<0) return;
    char line[160];
    /* Selang-seling upload/download agar antrean lokal tidak menunda download. */
    int p=s->downloading?0:pending(&s->pending);
    if(p<0) {s->retry_at=now+15000;return;}
    if(p==1) {
        RoadEvent *e=&s->pending;
        snprintf(line,sizeof(line),"PUT %lu %lu %lu %ld %ld %ld\n",
          (unsigned long)e->device,(unsigned long)e->seq,(unsigned long)e->utc,
          (long)e->lat_e7,(long)e->lon_e7,(long)e->peak_mg);
        s->downloading=false;
    } else {
        snprintf(line,sizeof(line),"GET %lu\n",(unsigned long)s->cursor);
        s->downloading=true;
    }
    if(road_uart_send(line)) {s->waiting=true;s->deadline=now+12000;}
    else s->retry_at=now+100;
}
void road_receive(RoadSync *s,const char *line,uint32_t now) {
    if(!s->waiting) return;
    unsigned long dev,seq,rev,utc;long lat,lon,peak;char extra;
    if(!s->downloading && sscanf(line,"ACK %lu %lu %c",&dev,&seq,&extra)==2 &&
       dev==s->pending.device && seq==s->pending.seq) {
        if(!save(ACK,0,&s->pending)) return;
        s->waiting=false;s->downloading=true;s->retry_at=now;return;
    }
    if(s->downloading && sscanf(line,"ROW %lu %lu %lu %lu %ld %ld %ld %c",
       &rev,&dev,&seq,&utc,&lat,&lon,&peak,&extra)==7 &&
       rev>s->cursor && rev<=UINT32_MAX && dev>0 && dev<=UINT32_MAX &&
       seq>0 && seq<=UINT32_MAX && utc<=UINT32_MAX && lat>=-900000000L &&
       lat<=900000000L && lon>=-1800000000L && lon<=1800000000L && peak>=0 && peak<=INT32_MAX) {
        RoadEvent e={(uint32_t)dev,(uint32_t)seq,(uint32_t)utc,(int32_t)lat,(int32_t)lon,(int32_t)peak};
        /* Lokasi dan cursor adalah satu record, sehingga tidak bisa terpisah. */
        if(!save(REMOTE,(uint32_t)rev,&e)) return;
        s->cursor=(uint32_t)rev;s->waiting=false;s->downloading=false;s->retry_at=now;return;
    }
    if(s->downloading && strcmp(line,"EMPTY")==0) {
        s->waiting=false;s->downloading=false;s->retry_at=now+30000;return;
    }
    /* Respons error atau rusak: jangan mengubah ACK/cursor. */
}
bool road_warning(RoadSync *s,int32_t lat,int32_t lon,float course,float speed,uint32_t now) {
    if(!coordinates(lat,lon) || !isfinite(course) || !isfinite(speed) || speed<1.5f ||
       (s->alarm_seen && (uint32_t)(now-s->last_alarm)<10000u)) return false;
    const double rad=0.017453292519943295;
    RoadRecord r;int n;bool found=false;
    for(uint32_t i=0;(n=read_record(i,&r))==1;i++) {
        if(r.kind!=LOCAL && r.kind!=REMOTE) continue;
        double north=((double)r.event.lat_e7-lat)*1e-7*111195.0;
        double east=((double)r.event.lon_e7-lon)*1e-7*111195.0*cos(lat*1e-7*rad);
        double distance=hypot(north,east);
        double diff=remainder(atan2(east,north)/rad-course,360.0);
        if(distance>=3.0 && distance<=25.0 && fabs(diff)<=40.0) found=true;
    }
    if(n<0) return false;
    if(found) {s->alarm_seen=true;s->last_alarm=now;}
    return found;
}
