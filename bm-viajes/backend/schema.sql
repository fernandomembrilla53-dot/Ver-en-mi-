-- BM Viajes: esquema de piloto seguro para Cloudflare D1.
-- Sin conductores verificados no se habilitan viajes reales.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  driver_status TEXT NOT NULL DEFAULT 'none' CHECK(driver_status IN ('none','pending','approved','rejected','suspended')),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS otp_challenges (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  last_sent_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  hits INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS rides (
  id TEXT PRIMARY KEY,
  rider_id TEXT NOT NULL REFERENCES users(id),
  driver_id TEXT REFERENCES users(id),
  origin_lat REAL NOT NULL,
  origin_lng REAL NOT NULL,
  destination_lat REAL NOT NULL,
  destination_lng REAL NOT NULL,
  distance_air_km REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','accepted','in_progress','completed','cancelled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rides_rider ON rides(rider_id,created_at DESC);
CREATE INDEX IF NOT EXISTS rides_driver ON rides(driver_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS rides_open ON rides(status,expires_at);

-- Se almacena solo la última posición de un conductor asignado y con viaje activo.
CREATE TABLE IF NOT EXISTS ride_positions (
  ride_id TEXT PRIMARY KEY REFERENCES rides(id) ON DELETE CASCADE,
  driver_id TEXT NOT NULL REFERENCES users(id),
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  accuracy_m REAL NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS positions_updated ON ride_positions(updated_at);

-- Additive pilot migration: no payments or trips are activated.
-- Amounts in integer ARS; existing rides remain unchanged.
CREATE TABLE IF NOT EXISTS ride_fares (
  ride_id TEXT PRIMARY KEY REFERENCES rides(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('one_way','round_trip')),
  tariff_version TEXT NOT NULL CHECK(length(tariff_version)>0),
  base_ars INTEGER NOT NULL CHECK(typeof(base_ars)='integer' AND base_ars>0),
  commission_bps INTEGER NOT NULL CHECK(typeof(commission_bps)='integer' AND commission_bps BETWEEN 0 AND 10000),
  wait_free_seconds INTEGER NOT NULL CHECK(typeof(wait_free_seconds)='integer' AND wait_free_seconds>=0),
  wait_minute_ars INTEGER NOT NULL CHECK(typeof(wait_minute_ars)='integer' AND wait_minute_ars>=0),
  created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at>0),
  CHECK(kind='round_trip' OR (wait_free_seconds=0 AND wait_minute_ars=0))
);

-- Pilot waiting and final fare records. No payment or real ride activation.
CREATE TABLE IF NOT EXISTS ride_waits (
  ride_id TEXT PRIMARY KEY REFERENCES ride_fares(ride_id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL CHECK(typeof(started_at)='integer' AND started_at>0),
  ended_at INTEGER CHECK(ended_at IS NULL OR (typeof(ended_at)='integer' AND ended_at>=started_at))
);
CREATE TABLE IF NOT EXISTS ride_totals (
  ride_id TEXT PRIMARY KEY REFERENCES ride_fares(ride_id) ON DELETE CASCADE,
  wait_seconds INTEGER NOT NULL CHECK(typeof(wait_seconds)='integer' AND wait_seconds BETWEEN 0 AND 86400),
  waiting_ars INTEGER NOT NULL CHECK(typeof(waiting_ars)='integer' AND waiting_ars>=0),
  total_ars INTEGER NOT NULL CHECK(typeof(total_ars)='integer' AND total_ars>0),
  commission_ars INTEGER NOT NULL CHECK(typeof(commission_ars)='integer' AND commission_ars BETWEEN 0 AND total_ars),
  finalized_at INTEGER NOT NULL CHECK(typeof(finalized_at)='integer' AND finalized_at>0)
);

-- Cash declarations are not bank settlement. Both participants must confirm.
CREATE TABLE IF NOT EXISTS cash_confirmations (
 ride_id TEXT NOT NULL REFERENCES ride_totals(ride_id),
 role TEXT NOT NULL CHECK(role IN ('rider','driver')),
 user_id TEXT NOT NULL REFERENCES users(id),
 confirmed_at INTEGER NOT NULL CHECK(typeof(confirmed_at)='integer' AND confirmed_at>0),
 PRIMARY KEY(ride_id,role)
);
CREATE TABLE IF NOT EXISTS driver_ledger (
 id TEXT PRIMARY KEY,
 driver_id TEXT NOT NULL REFERENCES users(id),
 ride_id TEXT NOT NULL UNIQUE REFERENCES ride_totals(ride_id),
 kind TEXT NOT NULL CHECK(kind='cash_commission_due'),
 amount_ars INTEGER NOT NULL CHECK(typeof(amount_ars)='integer' AND amount_ars>=0),
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at>0)
);
CREATE INDEX IF NOT EXISTS driver_ledger_owner ON driver_ledger(driver_id,created_at);
CREATE TRIGGER IF NOT EXISTS cash_confirmation_guard BEFORE INSERT ON cash_confirmations
WHEN NOT EXISTS (SELECT 1 FROM rides r WHERE r.id=NEW.ride_id AND r.status='completed' AND ((NEW.role='rider' AND r.rider_id=NEW.user_id) OR (NEW.role='driver' AND r.driver_id=NEW.user_id)))
BEGIN SELECT RAISE(ABORT,'invalid cash participant'); END;
CREATE TRIGGER IF NOT EXISTS cash_commission_post AFTER INSERT ON cash_confirmations
WHEN (SELECT COUNT(*) FROM cash_confirmations WHERE ride_id=NEW.ride_id)=2
BEGIN
 INSERT INTO driver_ledger(id,driver_id,ride_id,kind,amount_ars,created_at)
 SELECT 'cash:'||r.id,r.driver_id,r.id,'cash_commission_due',t.commission_ars,NEW.confirmed_at
 FROM rides r JOIN ride_totals t ON t.ride_id=r.id WHERE r.id=NEW.ride_id;
END;
CREATE TRIGGER IF NOT EXISTS cash_no_update BEFORE UPDATE ON cash_confirmations BEGIN SELECT RAISE(ABORT,'immutable cash confirmation'); END;
CREATE TRIGGER IF NOT EXISTS cash_no_delete BEFORE DELETE ON cash_confirmations BEGIN SELECT RAISE(ABORT,'immutable cash confirmation'); END;
CREATE TRIGGER IF NOT EXISTS ledger_no_update BEFORE UPDATE ON driver_ledger BEGIN SELECT RAISE(ABORT,'immutable ledger'); END;
CREATE TRIGGER IF NOT EXISTS ledger_no_delete BEFORE DELETE ON driver_ledger BEGIN SELECT RAISE(ABORT,'immutable ledger'); END;
