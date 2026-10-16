import importlib.util
from pathlib import Path
import tempfile
import unittest
import threading
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import json

spec = importlib.util.spec_from_file_location('server', Path(__file__).parents[1] / 'server/server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)

class ServerTests(unittest.TestCase):
    def test_two_devices_and_retries(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = server.connect(str(Path(tmp) / 'events.db'))
            a = dict(device=1, seq=1, utc=100, lat_e7=-78000000, lon_e7=1100000000, peak_mg=2500)
            b = dict(a, device=2)
            self.assertEqual(server.put(db, a), 'ACK 1 1')
            self.assertEqual(server.put(db, a), 'ACK 1 1')
            self.assertEqual(server.put(db, b), 'ACK 2 1')
            self.assertEqual(db.execute('SELECT COUNT(*) FROM events').fetchone()[0], 2)
            self.assertTrue(server.get(db, 0).startswith('ROW 1 1 1 '))
            self.assertTrue(server.get(db, 1).startswith('ROW 2 2 1 '))
            self.assertEqual(server.get(db, 2), 'EMPTY')
            with self.assertRaises(ValueError):
                server.put(db, dict(a, peak_mg=999))
            with self.assertRaises(ValueError):
                server.put(db, dict(a, lat_e7=910000000))
            db.close()
            db = server.connect(str(Path(tmp) / 'events.db'))
            self.assertTrue(server.get(db, 1).startswith('ROW 2 '))
            db.close()

    def test_http(self):
        with tempfile.TemporaryDirectory() as tmp:
            http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
            http.db_path = str(Path(tmp) / 'events.db')
            http.token = 'test-token-123456'
            thread = threading.Thread(target=http.serve_forever, daemon=True)
            thread.start()
            url = f'http://127.0.0.1:{http.server_port}'
            try:
                with self.assertRaises(HTTPError) as error:
                    urlopen(url + '/changes?after=0')
                self.assertEqual(error.exception.code, 401)
                event = dict(device=3, seq=1, utc=100, lat_e7=0, lon_e7=0, peak_mg=2000)
                req = Request(url + '/events', json.dumps(event).encode(),
                              {'Authorization': 'Bearer ' + http.token, 'Content-Type': 'application/json'})
                with urlopen(req) as res:
                    self.assertEqual(res.read(), b'ACK 3 1\n')
                req = Request(url + '/changes?after=0', headers={'Authorization': 'Bearer ' + http.token})
                with urlopen(req) as res:
                    self.assertEqual(res.read(), b'ROW 1 3 1 100 0 0 2000\n')
            finally:
                http.shutdown()
                http.server_close()
                thread.join()

if __name__ == '__main__':
    unittest.main()
