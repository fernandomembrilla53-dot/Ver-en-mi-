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
