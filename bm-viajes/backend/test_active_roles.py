"""Regression: one active ride per account across passenger and driver roles.
Run: python3 bm-viajes/backend/test_active_roles.py
Uses SQLite and the actual SQL statements in worker.mjs; no network or real rides.
"""
import sqlite3
import re
from pathlib import Path

root = Path(__file__).parent
source = (root / "worker.mjs").read_text()
new = re.search(r'prepare\("(INSERT INTO rides\(id,rider_id,origin_lat[^"]+)"\)', source).group(1)
accept = re.search(r'prepare\("(UPDATE rides SET driver_id=\?[^"]+)"\)', source).group(1)
db = sqlite3.connect(":memory:")
db.executescript((root / "schema.sql").read_text())
for user in ("a", "b", "c"):
    db.execute("INSERT INTO users(id,email,driver_status,created_at) VALUES(?,?,?,?)",
               (user, user+"@example.invalid", "approved", 0))

def request(id, user, now=100):
    return db.execute(new, (id,user,0,0,1,1,1,now,now,now+900,user,now,user)).rowcount

def take(id, user, now=100):
    return db.execute(accept, (user,now,id,now,user,user,user,now,user)).rowcount

assert request("r1","a") == 1
assert request("r2","b") == 1
assert take("r1","b") == 0
assert take("r1","c") == 1
assert request("r3","c") == 0
assert take("r2","c") == 0
db.execute("UPDATE rides SET status='completed' WHERE id='r1'")
assert request("r3","c") == 1
assert take("r2","c") == 0
assert take("r2","a") == 1
assert request("r4","a") == 0
db.execute("UPDATE rides SET status='cancelled' WHERE id='r2'")
assert request("r4","a") == 1
assert request("r5","b",1100) == 1
assert take("r5","c",1100) == 1
print("13 active-role assertions passed")
