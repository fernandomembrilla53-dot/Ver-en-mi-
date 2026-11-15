-- Operational data is private; roles are provisioned outside the public API.
CREATE TABLE IF NOT EXISTS admin_users(user_id TEXT PRIMARY KEY REFERENCES users(id));
CREATE TABLE IF NOT EXISTS blocked_users(user_id TEXT PRIMARY KEY REFERENCES users(id),reason TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS driver_profiles(user_id TEXT PRIMARY KEY REFERENCES users(id),display_name TEXT NOT NULL,vehicle TEXT NOT NULL,plate TEXT NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS driver_documents(user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('identity','license','permit','insurance','vtv')),cipher TEXT NOT NULL,expires_at INTEGER NOT NULL,review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','approved','rejected')),uploaded_at INTEGER NOT NULL,PRIMARY KEY(user_id,kind));
CREATE TABLE IF NOT EXISTS driver_availability(user_id TEXT PRIMARY KEY REFERENCES users(id),available INTEGER NOT NULL CHECK(available IN (0,1)),lat REAL,lng REAL,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ride_ratings(ride_id TEXT PRIMARY KEY REFERENCES rides(id),rider_id TEXT NOT NULL REFERENCES users(id),driver_id TEXT NOT NULL REFERENCES users(id),stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS incidents(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),ride_id TEXT REFERENCES rides(id),message TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),resolution TEXT,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS admin_audit(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL REFERENCES users(id),action TEXT NOT NULL,target TEXT NOT NULL,reason TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON admin_audit BEGIN SELECT RAISE(ABORT,'immutable audit'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON admin_audit BEGIN SELECT RAISE(ABORT,'immutable audit'); END;
CREATE TRIGGER IF NOT EXISTS fare_no_update BEFORE UPDATE ON ride_fares BEGIN SELECT RAISE(ABORT,'immutable fare'); END;
CREATE TRIGGER IF NOT EXISTS fare_no_delete BEFORE DELETE ON ride_fares BEGIN SELECT RAISE(ABORT,'immutable fare'); END;
CREATE TRIGGER IF NOT EXISTS total_no_update BEFORE UPDATE ON ride_totals BEGIN SELECT RAISE(ABORT,'immutable total'); END;
CREATE TRIGGER IF NOT EXISTS total_no_delete BEFORE DELETE ON ride_totals BEGIN SELECT RAISE(ABORT,'immutable total'); END;
CREATE TABLE IF NOT EXISTS tariff_proposals(id TEXT PRIMARY KEY,kind TEXT NOT NULL,amount_ars INTEGER NOT NULL CHECK(amount_ars>0),reason TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ride_declines(ride_id TEXT NOT NULL REFERENCES rides(id),driver_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,PRIMARY KEY(ride_id,driver_id));

CREATE TABLE IF NOT EXISTS map_requests(id TEXT PRIMARY KEY,last_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS map_cache(id TEXT PRIMARY KEY,response TEXT NOT NULL,expires_at INTEGER NOT NULL);
