-- OAuth credentials and one-use state; no real payments enabled.
CREATE TABLE IF NOT EXISTS mp_oauth_states (
 state_hash TEXT PRIMARY KEY,
 driver_id TEXT NOT NULL REFERENCES users(id),
 verifier_cipher TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mp_driver_accounts (
 driver_id TEXT PRIMARY KEY REFERENCES users(id),
 seller_id TEXT NOT NULL UNIQUE,
 token_cipher TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mp_checkout_intents (
 ride_id TEXT PRIMARY KEY REFERENCES ride_totals(ride_id),
 seller_id TEXT NOT NULL,
 external_reference TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL CHECK(status IN ('creating','ready','review','paid','refunded')),
 preference_id TEXT UNIQUE,
 checkout_url TEXT,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mp_verified_payments (
 payment_id TEXT PRIMARY KEY,
 ride_id TEXT NOT NULL UNIQUE REFERENCES mp_checkout_intents(ride_id),
 amount_ars INTEGER NOT NULL CHECK(amount_ars>0),
 verified_at INTEGER NOT NULL
);
