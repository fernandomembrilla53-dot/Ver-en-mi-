import sqlite3
import tempfile
import threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

# Run from any directory: python3 bm-viajes/backend/test_accept.py
# Uses the production SQL and schema, not a mock of the acceptance logic.
root = Path(__file__).resolve().parent
schema = (root / 'schema.sql').read_text()
worker = (root / 'worker.mjs').read_text()
sql = worker.split('async function acceptRide(', 1)[1].split('async function rideStatus(', 1)[0].split('prepare("UPDATE rides SET ', 1)[1].split('")', 1)[0]
sql = 'UPDATE rides SET ' + sql

def run_case(jobs, expected):
    with tempfile.TemporaryDirectory() as tmp:
        db = str(Path(tmp) / 'test.db')
        with sqlite3.connect(db) as conn:
            conn.executescript(schema)
            conn.executemany('INSERT INTO users(id,email,created_at) VALUES(?,?,0)', [(u,u+'@example.invalid') for u in ('r1','r2','d1','d2')])
            conn.execute("UPDATE users SET driver_status='approved' WHERE id IN ('d1','d2','r1')")
            conn.executemany("INSERT INTO rides(id,rider_id,origin_lat,origin_lng,destination_lat,destination_lng,distance_air_km,status,created_at,updated_at,expires_at) VALUES(?,?,0,0,1,1,1,'requested',0,0,?)", [('a','r1',100),('b','r2',100),('expired','r1',5)])
        barrier = threading.Barrier(len(jobs))
        def accept(job):
            driver, ride = job
            with sqlite3.connect(db, timeout=10) as conn:
                barrier.wait(timeout=10)
                return conn.execute(sql, (driver,10,ride,10,driver,driver,driver)).rowcount
        with ThreadPoolExecutor(max_workers=len(jobs)) as pool:
            results = list(pool.map(accept,jobs))
        assert sum(results) == expected, (jobs,results)
        with sqlite3.connect(db) as conn:
            assert conn.execute("SELECT count(*) FROM rides WHERE status='accepted'").fetchone()[0] == expected

for _ in range(10):
    run_case([('d1','a'),('d2','a')],1)
    run_case([('d1','a'),('d1','b')],1)
run_case([('r1','a')],0)
run_case([('d1','expired')],0)
run_case([('d1','a'),('d2','b')],2)
print('PASS: 23 cases; concurrent acceptance, self-acceptance, expiry and independent rides')

