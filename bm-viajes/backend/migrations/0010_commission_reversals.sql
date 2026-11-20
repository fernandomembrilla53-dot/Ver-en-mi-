CREATE TABLE IF NOT EXISTS commission_payment_reversals (
 settlement_id TEXT PRIMARY KEY REFERENCES commission_settlements(id),
 kind TEXT NOT NULL CHECK(kind IN ('refund','partial_refund','chargeback')),
 amount_ars INTEGER NOT NULL CHECK(typeof(amount_ars)='integer' AND amount_ars>0),
 observed_at INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS commission_reversal_guard BEFORE INSERT ON commission_payment_reversals WHEN NOT EXISTS(SELECT 1 FROM commission_settlements s WHERE s.id=NEW.settlement_id AND ((NEW.kind='partial_refund' AND NEW.amount_ars<s.amount_ars) OR (NEW.kind<>'partial_refund' AND NEW.amount_ars=s.amount_ars))) BEGIN SELECT RAISE(ABORT,'invalid commission reversal'); END;
CREATE TRIGGER IF NOT EXISTS commission_reversal_update BEFORE UPDATE ON commission_payment_reversals WHEN NEW.settlement_id<>OLD.settlement_id OR NEW.amount_ars<OLD.amount_ars OR (OLD.kind='chargeback' AND NEW.kind<>'chargeback') OR NOT EXISTS(SELECT 1 FROM commission_settlements s WHERE s.id=NEW.settlement_id AND ((NEW.kind='partial_refund' AND NEW.amount_ars<s.amount_ars) OR (NEW.kind<>'partial_refund' AND NEW.amount_ars=s.amount_ars))) BEGIN SELECT RAISE(ABORT,'invalid commission reversal update'); END;
CREATE TRIGGER IF NOT EXISTS commission_reversal_no_delete BEFORE DELETE ON commission_payment_reversals BEGIN SELECT RAISE(ABORT,'immutable commission reversal'); END;
DROP TRIGGER IF EXISTS settlement_balance_guard;
CREATE TRIGGER settlement_balance_guard BEFORE INSERT ON commission_settlements WHEN NEW.amount_ars > (SELECT COALESCE(SUM(amount_ars),0) FROM driver_ledger WHERE driver_id=NEW.driver_id) - (SELECT COALESCE(SUM(amount_ars),0) FROM commission_settlements WHERE driver_id=NEW.driver_id) + (SELECT COALESCE(SUM(v.amount_ars),0) FROM commission_payment_reversals v JOIN commission_settlements s ON s.id=v.settlement_id WHERE s.driver_id=NEW.driver_id) BEGIN SELECT RAISE(ABORT,'settlement exceeds debt'); END;
DROP TRIGGER IF EXISTS commission_intent_balance;
CREATE TRIGGER commission_intent_balance BEFORE INSERT ON commission_checkout_intents WHEN NEW.amount_ars > (SELECT COALESCE(SUM(amount_ars),0) FROM driver_ledger WHERE driver_id=NEW.driver_id) - (SELECT COALESCE(SUM(amount_ars),0) FROM commission_settlements WHERE driver_id=NEW.driver_id) + (SELECT COALESCE(SUM(v.amount_ars),0) FROM commission_payment_reversals v JOIN commission_settlements s ON s.id=v.settlement_id WHERE s.driver_id=NEW.driver_id) BEGIN SELECT RAISE(ABORT,'intent exceeds debt'); END;
