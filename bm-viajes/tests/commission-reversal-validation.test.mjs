import test from 'node:test';
import assert from 'node:assert/strict';
import { commissionReversal } from '../backend/mp-commission-receive.mjs';

const intent = Object.freeze({ amount_ars: 1000, external_reference: 'bm-viajes:commission:test', collector_id: '12345' });
const payment = Object.freeze({ id: 789, currency_id: 'ARS', transaction_amount: 1000, external_reference: intent.external_reference, collector_id: 12345, live_mode: false, status: 'approved', transaction_amount_refunded: 0 });

test('no reversal on untouched approved payment', () => {
 assert.equal(commissionReversal(payment, intent, '789'), null);
});
test('partial and full refunds restore commission debt', () => {
 assert.deepEqual(commissionReversal({ ...payment, transaction_amount_refunded: 400 }, intent, '789'), { kind: 'partial_refund', amount: 400 });
 assert.deepEqual(commissionReversal({ ...payment, status: 'refunded', transaction_amount_refunded: 1000 }, intent, '789'), { kind: 'refund', amount: 1000 });
 assert.deepEqual(commissionReversal({ ...payment, status: 'charged_back' }, intent, '789'), { kind: 'chargeback', amount: 1000 });
});
test('reject malformed or mismatched provider payments', () => {
 for (const override of [
  { id: 999 }, { currency_id: 'USD' }, { transaction_amount: 999 },
  { external_reference: 'other' }, { collector_id: 999 }, { live_mode: true },
  { transaction_amount_refunded: -1 }, { transaction_amount_refunded: 1001 },
  { transaction_amount_refunded: 0.5 }, { status: 'refunded', transaction_amount_refunded: 500 },
 ]) assert.throws(() => commissionReversal({ ...payment, ...override }, intent, '789'));
});
