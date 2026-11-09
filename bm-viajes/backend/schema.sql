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
