-- Preserve payment/reversal consistency when provider reconciliation updates an existing reversal.
-- Additive migration; no production payments are enabled by this change.
CREATE TRIGGER IF NOT EXISTS mp_reversal_update_guard
BEFORE UPDATE ON mp_payment_reversals
WHEN NOT EXISTS (
  SELECT 1 FROM mp_verified_payments p
  WHERE p.payment_id = NEW.payment_id
    AND NEW.amount_ars <= p.amount_ars
    AND (
      (NEW.kind = 'partial_refund' AND NEW.amount_ars < p.amount_ars)
      OR (NEW.kind IN ('refund', 'chargeback') AND NEW.amount_ars = p.amount_ars)
    )
)
BEGIN
  SELECT RAISE(ABORT, 'invalid reversal update');
END;
