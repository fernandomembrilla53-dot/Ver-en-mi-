CREATE TABLE IF NOT EXISTS commission_reconcile_checks (
 intent_id TEXT PRIMARY KEY REFERENCES commission_checkout_intents(id),
 checked_at INTEGER NOT NULL CHECK(typeof(checked_at)='integer' AND checked_at>=0)
);
