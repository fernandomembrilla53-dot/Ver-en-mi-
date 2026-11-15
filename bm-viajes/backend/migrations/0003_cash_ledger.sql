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
