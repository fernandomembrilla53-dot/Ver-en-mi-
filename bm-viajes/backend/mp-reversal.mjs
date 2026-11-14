// Read-only reconciliation of a previously verified payment; never issues refunds.
export function verifiedReversal(p, expected) {
 if(!p||!expected||String(p.id)!==String(expected.paymentId)||p.external_reference!==expected.reference||String(p.collector_id)!==String(expected.collectorId)||p.currency_id!=='ARS'||p.live_mode!==false||p.transaction_amount!==expected.amountArs||!Number.isSafeInteger(expected.amountArs)||expected.amountArs<=0)throw Error('Reversal identity mismatch');
 const amount=p.transaction_amount_refunded;
 if(!Number.isSafeInteger(amount)||amount<0||amount>expected.amountArs)throw Error('Invalid refund amount');
 if(p.status==='charged_back')return {kind:'chargeback',amountArs:expected.amountArs};
 if(p.status==='refunded'&&amount===expected.amountArs)return {kind:'refund',amountArs:amount};
 if(p.status==='approved'&&amount>0&&amount<expected.amountArs)return {kind:'partial_refund',amountArs:amount};
 if(p.status==='approved'&&amount===0)return null;
 throw Error('Unrecognized reversal state');
}
