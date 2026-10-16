#include "road_sync.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
static RoadRecord records[128];
static unsigned count;
static bool fail_write;
static char tx[180];
int road_disk_open(void){return 0;}
int road_disk_read(uint32_t i,RoadRecord *r){if(i>=count)return 0;*r=records[i];return 1;}
int road_disk_append(const RoadRecord *r){if(fail_write)return -1;assert(count<128);records[count++]=*r;return 0;}
bool road_uart_send(const char *line){snprintf(tx,sizeof(tx),"%s",line);return true;}
int main(void){
 RoadSync s;assert(road_init(&s,1));
 assert(!road_log_imu(&s,100,0,0,2300,false));
 assert(road_log_imu(&s,100,0,1000,2300,true));
 road_tick(&s,0);assert(strncmp(tx,"PUT 1 1 ",8)==0);
 road_receive(&s,"ACK 2 1",1);assert(s.waiting);
 fail_write=true;road_receive(&s,"ACK 1 1",1);assert(s.waiting);
 fail_write=false;road_receive(&s,"ACK 1 1",2);assert(!s.waiting);
 road_tick(&s,2);assert(strcmp(tx,"GET 0\n")==0);
 fail_write=true;road_receive(&s,"ROW 1 2 1 100 0 2000 2500",3);assert(s.cursor==0);
 fail_write=false;road_receive(&s,"ROW 1 2 1 100 0 2000 2500",4);assert(s.cursor==1);
 assert(road_init(&s,1));assert(s.seq==1 && s.cursor==1);
 road_tick(&s,0);assert(strcmp(tx,"GET 1\n")==0);
 road_receive(&s,"EMPTY",1);assert(!s.waiting);
 assert(!road_warning(&s,0,0,270,4,100));
 assert(road_warning(&s,0,0,90,4,100));
 assert(!road_warning(&s,0,0,90,4,101));
 assert(!road_warning(&s,0,0,90,0,12000));
 assert(road_warning(&s,0,0,90,4,12000));
 road_tick(&s,40000);assert(s.waiting);
 road_tick(&s,53000);assert(!s.waiting);
 assert(road_log_imu(&s,200,0,3000,3000,true));
 assert(s.seq==2);
 records[0].event.peak_mg++;
 assert(!road_init(&s,1));
 puts("core: persistence, retry, ACK, remote cursor, GPS warning, corruption OK");
}
