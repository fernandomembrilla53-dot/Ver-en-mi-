// Persist only reversals of an already verified payment; never initiate a refund.
export async function storeReversal(db, paymentId, rideId, reversal, now=Date.now()) {
 if(!reversal)return;
 const {kind,amountArs}=reversal;
 await db.batch([
 db.prepare(`INSERT INTO mp_payment_reversals(payment_id,kind,amount_ars,observed_at) VALUES(?,?,?,?) ON CONFLICT(payment_id) DO UPDATE SET kind=excluded.kind,amount_ars=excluded.amount_ars,observed_at=excluded.observed_at WHERE excluded.amount_ars>=mp_payment_reversals.amount_ars AND (mp_payment_reversals.kind<>'chargeback' OR excluded.kind='chargeback') AND (excluded.amount_ars>mp_payment_reversals.amount_ars OR excluded.kind='chargeback' AND mp_payment_reversals.kind<>'chargeback')`).bind(paymentId,kind,amountArs,now),
 db.prepare(`UPDATE mp_checkout_intents SET status='refunded' WHERE ride_id=? AND status IN ('paid','refunded') AND EXISTS(SELECT 1 FROM mp_verified_payments p JOIN mp_payment_reversals v ON v.payment_id=p.payment_id WHERE p.ride_id=? AND p.payment_id=? AND v.amount_ars=p.amount_ars)`).bind(rideId,rideId,paymentId)
 ]);
}
