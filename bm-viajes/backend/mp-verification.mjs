// Pure validation of a payment fetched server-to-server. Not a webhook or checkout.
export function verifyApprovedPayment(payment, expected) {
  if (!payment || !expected || typeof expected.reference !== "string" || !expected.reference || !Number.isSafeInteger(expected.amountArs) || expected.amountArs <= 0 || typeof expected.liveMode !== "boolean" || !/^[1-9]\d*$/.test(String(expected.collectorId))) throw new Error("Invalid payment expectation");
  if (!/^[1-9]\d*$/.test(String(payment.id)) || payment.status !== "approved" || payment.currency_id !== "ARS" || payment.transaction_amount !== expected.amountArs || payment.external_reference !== expected.reference || String(payment.collector_id) !== String(expected.collectorId) || payment.live_mode !== expected.liveMode || payment.transaction_amount_refunded !== 0) throw new Error("Payment verification failed");
  return { providerReference: "mp:" + String(payment.id), amountArs: expected.amountArs };
}
