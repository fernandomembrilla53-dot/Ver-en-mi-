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
