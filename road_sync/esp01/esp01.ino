/* Firmware custom ESP8266 ESP-01S, menggantikan firmware AT.
   UART0: hanya protokol STM32, tanpa debug Serial. */
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include "secrets.h"
static char input[180];
static size_t used;
static bool overflow;
static uint32_t lastConnect;
static void request(const char *line) {
  if (WiFi.status()!=WL_CONNECTED) { Serial.println("ERR OFFLINE"); return; }
  unsigned long d,s,t,c; long lat,lon,peak; char extra;
  String path,body;
  bool upload=false;
  if (sscanf(line,"PUT %lu %lu %lu %ld %ld %ld %c",&d,&s,&t,&lat,&lon,&peak,&extra)==6) {
    upload=true;path="/events";
    char json[240];
    snprintf(json,sizeof(json),"{\"device\":%lu,\"seq\":%lu,\"utc\":%lu,\"lat_e7\":%ld,\"lon_e7\":%ld,\"peak_mg\":%ld}",d,s,t,lat,lon,peak);
    body=json;
  } else if(sscanf(line,"GET %lu %c",&c,&extra)==1) {
    path="/changes?after="+String(c);
  } else { Serial.println("ERR FORMAT");return; }
  WiFiClient client;
  HTTPClient http;
  http.setTimeout(5000);
  if(!http.begin(client,String(ROAD_SERVER_URL)+path)) {Serial.println("ERR HTTP");return;}
  http.addHeader("Authorization",String("Bearer ")+ROAD_API_TOKEN);
  if(upload) http.addHeader("Content-Type","application/json");
  int status=upload?http.POST(body):http.GET();
  if(status==200 && http.getSize()>0 && http.getSize()<170) {
    String answer=http.getString();answer.trim();
    if(answer.indexOf('\n')<0 && answer.indexOf('\r')<0) Serial.println(answer);
    else Serial.println("ERR RESPONSE");
  } else Serial.println("ERR SERVER");
  http.end();
}
void setup() {
  Serial.begin(115200);Serial.setDebugOutput(false);
  WiFi.mode(WIFI_STA);WiFi.persistent(false);
  WiFi.begin(ROAD_WIFI_SSID,ROAD_WIFI_PASSWORD);
  lastConnect=millis();
}
void loop() {
  if(WiFi.status()!=WL_CONNECTED && (uint32_t)(millis()-lastConnect)>=15000) {
    lastConnect=millis();WiFi.begin(ROAD_WIFI_SSID,ROAD_WIFI_PASSWORD);
  }
  while(Serial.available()) {
    char ch=(char)Serial.read();
    if(ch=='\n') {
      if(!overflow) {input[used]=0;request(input);}
      else Serial.println("ERR LENGTH");
      used=0;overflow=false;
    } else if(ch!='\r') {
      if(used+1<sizeof(input)) input[used++]=ch;
      else overflow=true;
    }
  }
  yield();
}
