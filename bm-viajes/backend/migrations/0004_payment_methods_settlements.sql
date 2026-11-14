-- Payment method is fixed at request time; legacy rides remain cash-only.
CREATE TABLE IF NOT EXISTS ride_payment_methods (
 ride_id TEXT PRIMARY KEY REFERENCES rides(id),
 method TEXT NOT NULL CHECK(method IN ('cash','mercadopago'))
);
CREATE TRIGGER IF NOT EXISTS payment_method_no_update BEFORE UPDATE ON ride_payment_methods BEGIN SELECT RAISE(ABORT,'immutable payment method'); END;
CREATE TRIGGER IF NOT EXISTS payment_method_no_delete BEFORE DELETE ON ride_payment_methods BEGIN SELECT RAISE(ABORT,'immutable payment method'); END;
CREATE TRIGGER IF NOT EXISTS cash_method_guard BEFORE INSERT ON cash_confirmations
WHEN EXISTS (SELECT 1 FROM ride_payment_methods WHERE ride_id=NEW.ride_id AND method<>'cash')
BEGIN SELECT RAISE(ABORT,'cash not selected'); END;
-- Verified credits only: no public endpoint can insert these records.
CREATE TABLE IF NOT EXISTS commission_settlements (
 id TEXT PRIMARY KEY,
 driver_id TEXT NOT NULL REFERENCES users(id),
 provider_reference TEXT NOT NULL UNIQUE CHECK(length(provider_reference) BETWEEN 1 AND 200),
 amount_ars INTEGER NOT NULL CHECK(typeof(amount_ars)='integer' AND amount_ars>0),
 verified_at INTEGER NOT NULL CHECK(typeof(verified_at)='integer' AND verified_at>0)
);
CREATE TRIGGER IF NOT EXISTS settlement_balance_guard BEFORE INSERT ON commission_settlements
WHEN NEW.amount_ars > (SELECT COALESCE(SUM(amount_ars),0) FROM driver_ledger WHERE driver_id=NEW.driver_id) - (SELECT COALESCE(SUM(amount_ars),0) FROM commission_settlements WHERE driver_id=NEW.driver_id)
BEGIN SELECT RAISE(ABORT,'settlement exceeds debt'); END;
CREATE TRIGGER IF NOT EXISTS settlement_no_update BEFORE UPDATE ON commission_settlements BEGIN SELECT RAISE(ABORT,'immutable settlement'); END;
CREATE TRIGGER IF NOT EXISTS settlement_no_delete BEFORE DELETE ON commission_settlements BEGIN SELECT RAISE(ABORT,'immutable settlement'); END;
