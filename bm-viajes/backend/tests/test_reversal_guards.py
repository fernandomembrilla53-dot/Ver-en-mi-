"""SQLite regression for Mercado Pago reversal guards; no network or real payments.

Run from repository root:
    python -m unittest discover -s bm-viajes/backend/tests -p 'test_reversal_guards.py' -v
"""
import sqlite3
import unittest
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]


class ReversalGuardTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.executescript((BACKEND / "schema.sql").read_text(encoding="utf-8"))
        self.db.execute(
            "INSERT INTO users(id,email,created_at) VALUES('rider','rider@example.test',1)"
        )
        self.db.execute(
            """INSERT INTO rides(id,rider_id,origin_lat,origin_lng,destination_lat,
               destination_lng,distance_air_km,created_at,updated_at,expires_at)
               VALUES('ride','rider',0,0,0,0,1,1,1,100)"""
        )
        self.db.execute(
            """INSERT INTO ride_fares(ride_id,kind,tariff_version,base_ars,
               commission_bps,wait_free_seconds,wait_minute_ars,created_at)
               VALUES('ride','one_way','v1',4000,1000,0,0,1)"""
        )
        self.db.execute(
            """INSERT INTO ride_totals(ride_id,wait_seconds,waiting_ars,total_ars,
               commission_ars,finalized_at) VALUES('ride',0,0,4000,400,1)"""
        )
        self.db.execute(
            """INSERT INTO mp_checkout_intents(ride_id,seller_id,external_reference,
               status,created_at) VALUES('ride','seller','ref','paid',1)"""
        )
        self.db.execute(
            "INSERT INTO mp_verified_payments(payment_id,ride_id,amount_ars,verified_at) VALUES('pay','ride',4000,1)"
        )

    def tearDown(self):
        self.db.close()

    def reversal(self, kind, amount):
        self.db.execute(
            "INSERT INTO mp_payment_reversals(payment_id,kind,amount_ars,observed_at) VALUES('pay',?,?,1)",
            (kind, amount),
        )

    def test_partial_then_full_refund(self):
        self.reversal("partial_refund", 1000)
        self.db.execute(
            "UPDATE mp_payment_reversals SET kind='refund',amount_ars=4000 WHERE payment_id='pay'"
        )
        self.assertEqual(
            self.db.execute("SELECT kind,amount_ars FROM mp_payment_reversals").fetchone(),
            ("refund", 4000),
        )

    def test_insert_rejects_invalid_full_refund(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.reversal("refund", 1000)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM mp_payment_reversals").fetchone()[0], 0)

    def test_update_rejects_partial_equal_to_total(self):
        self.reversal("partial_refund", 1000)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "UPDATE mp_payment_reversals SET amount_ars=4000 WHERE payment_id='pay'"
            )
        self.assertEqual(self.db.execute("SELECT amount_ars FROM mp_payment_reversals").fetchone()[0], 1000)

    def test_update_rejects_overpayment_and_rolls_back(self):
        self.reversal("partial_refund", 1000)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "UPDATE mp_payment_reversals SET kind='refund',amount_ars=5000 WHERE payment_id='pay'"
            )
        self.assertEqual(
            self.db.execute("SELECT kind,amount_ars FROM mp_payment_reversals").fetchone(),
            ("partial_refund", 1000),
        )

    def test_update_rejects_regression(self):
        self.reversal("partial_refund", 2000)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE mp_payment_reversals SET amount_ars=1000 WHERE payment_id='pay'")

    def test_chargeback_cannot_revert(self):
        self.reversal("chargeback", 4000)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE mp_payment_reversals SET kind='refund' WHERE payment_id='pay'")

    def test_migration_applies_twice_and_preserves_existing_reversal(self):
        # Emulate a pre-0008 database: the schema contains the new trigger,
        # but the production database has not applied the additive migration.
        self.reversal("partial_refund", 1000)
        self.db.execute("DROP TRIGGER IF EXISTS mp_reversal_update_guard")
        migration = (BACKEND / "migrations" / "0008_mp_reversal_update_guard.sql").read_text(encoding="utf-8")
        self.db.executescript(migration)
        self.db.executescript(migration)
        self.assertEqual(
            self.db.execute("SELECT kind,amount_ars FROM mp_payment_reversals WHERE payment_id='pay'").fetchone(),
            ("partial_refund", 1000),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "UPDATE mp_payment_reversals SET amount_ars=4000 WHERE payment_id='pay'"
            )
        self.assertEqual(
            self.db.execute("SELECT amount_ars FROM mp_payment_reversals WHERE payment_id='pay'").fetchone()[0],
            1000,
        )

    def test_upgrade_from_legacy_schema_preserves_existing_payment_and_reversal(self):
        # A real pre-0008 schema must not already contain the new trigger.
        schema = (BACKEND / "schema.sql").read_text(encoding="utf-8")
        marker = "-- Keep direct schema initialization consistent with migration 0008."
        self.assertIn(marker, schema)
        old_schema = schema.split(marker, 1)[0]
        legacy = sqlite3.connect(":memory:")
        try:
            legacy.executescript(old_schema)
            self.assertIsNone(legacy.execute(
                "SELECT name FROM sqlite_master WHERE type='trigger' AND name='mp_reversal_update_guard'"
            ).fetchone())
            legacy.execute("INSERT INTO users(id,email,created_at) VALUES('r','r@example.test',1)")
            legacy.execute(
                """INSERT INTO rides(id,rider_id,origin_lat,origin_lng,destination_lat,
                destination_lng,distance_air_km,created_at,updated_at,expires_at)
                VALUES('ride','r',0,0,0,0,1,1,1,100)"""
            )
            legacy.execute(
                """INSERT INTO ride_fares(ride_id,kind,tariff_version,base_ars,
                commission_bps,wait_free_seconds,wait_minute_ars,created_at)
                VALUES('ride','one_way','v1',4000,1000,0,0,1)"""
            )
            legacy.execute(
                """INSERT INTO ride_totals(ride_id,wait_seconds,waiting_ars,total_ars,
                commission_ars,finalized_at) VALUES('ride',0,0,4000,400,1)"""
            )
            legacy.execute(
                """INSERT INTO mp_checkout_intents(ride_id,seller_id,external_reference,
                status,created_at) VALUES('ride','seller','ref','paid',1)"""
            )
            legacy.execute(
                "INSERT INTO mp_verified_payments(payment_id,ride_id,amount_ars,verified_at) VALUES('pay','ride',4000,1)"
            )
            legacy.execute(
                "INSERT INTO mp_payment_reversals(payment_id,kind,amount_ars,observed_at) VALUES('pay','partial_refund',1000,1)"
            )
            migration = (BACKEND / "migrations" / "0008_mp_reversal_update_guard.sql").read_text(encoding="utf-8")
            legacy.executescript(migration)
            legacy.executescript(migration)
            self.assertIsNotNone(legacy.execute(
                "SELECT name FROM sqlite_master WHERE type='trigger' AND name='mp_reversal_update_guard'"
            ).fetchone())
            self.assertEqual(legacy.execute(
                "SELECT kind,amount_ars FROM mp_payment_reversals WHERE payment_id='pay'"
            ).fetchone(), ("partial_refund", 1000))
            with self.assertRaises(sqlite3.IntegrityError):
                legacy.execute(
                    "UPDATE mp_payment_reversals SET kind='refund',amount_ars=3000 WHERE payment_id='pay'"
                )
            self.assertEqual(legacy.execute(
                "SELECT kind,amount_ars FROM mp_payment_reversals WHERE payment_id='pay'"
            ).fetchone(), ("partial_refund", 1000))
            legacy.execute(
                "UPDATE mp_payment_reversals SET kind='refund',amount_ars=4000 WHERE payment_id='pay'"
            )
            self.assertEqual(legacy.execute(
                "SELECT kind,amount_ars FROM mp_payment_reversals WHERE payment_id='pay'"
            ).fetchone(), ("refund", 4000))
        finally:
            legacy.close()

    def test_duplicate_insert_rejected(self):
        self.reversal("partial_refund", 1000)
        with self.assertRaises(sqlite3.IntegrityError):
            self.reversal("partial_refund", 1000)


if __name__ == "__main__":
    unittest.main()
