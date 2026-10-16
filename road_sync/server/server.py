"""Server prototipe LAN, Python standard library, SQLite durable/idempotent."""
import argparse
import json
import os
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

FIELDS = ('device', 'seq', 'utc', 'lat_e7', 'lon_e7', 'peak_mg')

def connect(path):
    db = sqlite3.connect(path, timeout=10)
    db.execute('PRAGMA synchronous=FULL')
    db.execute('''CREATE TABLE IF NOT EXISTS events (
        revision INTEGER PRIMARY KEY AUTOINCREMENT,
        device INTEGER NOT NULL, seq INTEGER NOT NULL, utc INTEGER NOT NULL,
        lat_e7 INTEGER NOT NULL, lon_e7 INTEGER NOT NULL, peak_mg INTEGER NOT NULL,
        UNIQUE(device, seq))''')
    db.commit()
    return db

def validate(event):
    if set(event) != set(FIELDS) or any(type(event[k]) is not int for k in FIELDS):
        raise ValueError('Fields must be integers: ' + ','.join(FIELDS))
    for k in ('device', 'seq'):
        if not 1 <= event[k] <= 0xffffffff:
            raise ValueError(k)
    if not (0 <= event['utc'] <= 0xffffffff and
            -900000000 <= event['lat_e7'] <= 900000000 and
            -1800000000 <= event['lon_e7'] <= 1800000000 and
            0 <= event['peak_mg'] <= 0x7fffffff):
        raise ValueError('Invalid event range')

def put(db, event):
    validate(event)
    values = tuple(event[k] for k in FIELDS)
    with db:
        existing = db.execute('SELECT device,seq,utc,lat_e7,lon_e7,peak_mg FROM events WHERE device=? AND seq=?', values[:2]).fetchone()
        if existing and existing != values:
            raise ValueError('Event ID already exists with different payload')
        if not existing:
            db.execute('INSERT INTO events(device,seq,utc,lat_e7,lon_e7,peak_mg) VALUES (?,?,?,?,?,?)', values)
    return f"ACK {event['device']} {event['seq']}"

def get(db, cursor):
    if not 0 <= cursor <= 0xffffffff:
        raise ValueError('Invalid cursor')
    row = db.execute('SELECT revision,device,seq,utc,lat_e7,lon_e7,peak_mg FROM events WHERE revision>? ORDER BY revision LIMIT 1', (cursor,)).fetchone()
    return 'ROW ' + ' '.join(map(str, row)) if row else 'EMPTY'

class Handler(BaseHTTPRequestHandler):
    def reply(self, status, body):
        body = (body + '\n').encode()
        self.send_response(status)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_api(self):
        if self.headers.get('Authorization') != 'Bearer ' + self.server.token:
            self.reply(401, 'Unauthorized')
            return
        db = connect(self.server.db_path)
        try:
            parsed = urlparse(self.path)
            if self.command == 'POST' and parsed.path == '/events':
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 512:
                    raise ValueError('Invalid body length')
                self.connection.settimeout(5)
                event = json.loads(self.rfile.read(length))
                if not isinstance(event, dict):
                    raise ValueError('Object required')
                self.reply(200, put(db, event))
            elif self.command == 'GET' and parsed.path == '/changes':
                self.reply(200, get(db, int(parse_qs(parsed.query).get('after', ['0'])[0])))
            else:
                self.reply(404, 'Not found')
        except (ValueError, TypeError, TimeoutError):
            self.reply(400, 'Invalid request or conflicting event ID')
        except sqlite3.Error:
            self.reply(503, 'Database unavailable')
        finally:
            db.close()

    do_GET = handle_api
    do_POST = handle_api

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8080)
    parser.add_argument('--db', default='road.db')
    args = parser.parse_args()
    token = os.environ.get('ROAD_API_TOKEN', '')
    if len(token) < 16:
        parser.error('Set ROAD_API_TOKEN to a secret of at least 16 characters')
    connect(args.db).close()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    server.token, server.db_path = token, args.db
    print(f'Listening on {args.host}:{args.port}')
    server.serve_forever()
