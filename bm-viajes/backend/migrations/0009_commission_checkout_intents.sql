-- Independent commission checkout reservation; never credits a debt by itself.
CREATE TABLE IF NOT EXISTS commission_checkout_intents (
 id TEXT PRIMARY KEY,
 driver_id TEXT NOT NULL REFERENCES users(id),
 amount_ars INTEGER NOT NULL CHECK(typeof(amount_ars)='integer' AND amount_ars>0),
 collector_id TEXT NOT NULL CHECK(length(collector_id)>0),
 external_reference TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL CHECK(status IN ('creating','ready','review','paid')),
 preference_id TEXT UNIQUE,
 checkout_url TEXT,
 created_at INTEGER NOT NULL,
 CHECK(status<>'ready' OR (preference_id IS NOT NULL AND checkout_url IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS commission_one_open ON commission_checkout_intents(driver_id) WHERE status IN ('creating','ready','review');
CREATE TRIGGER IF NOT EXISTS commission_intent_balance BEFORE INSERT ON commission_checkout_intents
WHEN NEW.amount_ars > (SELECT COALESCE(SUM(amount_ars),0) FROM driver_ledger WHERE driver_id=NEW.driver_id) - (SELECT COALESCE(SUM(amount_ars),0) FROM commission_settlements WHERE driver_id=NEW.driver_id)
BEGIN SELECT RAISE(ABORT,'intent exceeds debt'); END;
CREATE TRIGGER IF NOT EXISTS commission_intent_identity BEFORE UPDATE ON commission_checkout_intents
WHEN NEW.id<>OLD.id OR NEW.driver_id<>OLD.driver_id OR NEW.amount_ars<>OLD.amount_ars OR NEW.collector_id<>OLD.collector_id OR NEW.external_reference<>OLD.external_reference OR NEW.created_at<>OLD.created_at
BEGIN SELECT RAISE(ABORT,'immutable commission intent'); END;
CREATE TRIGGER IF NOT EXISTS commission_intent_no_delete BEFORE DELETE ON commission_checkout_intents BEGIN SELECT RAISE(ABORT,'immutable commission intent'); END;
