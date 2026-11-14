import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyApprovedPayment } from '../backend/mp-verification.mjs';
const expected={reference:'settlement:abc',amountArs:400,collectorId:'123',liveMode:false};
const payment={id:987,status:'approved',currency_id:'ARS',transaction_amount:400,external_reference:'settlement:abc',collector_id:123,live_mode:false,transaction_amount_refunded:0};
test('verified provider payment matches immutable server expectation',()=>{
 assert.deepEqual(verifyApprovedPayment(payment,expected),{providerReference:'mp:987',amountArs:400});
});
test('reject unapproved, mismatched, refunded or malformed payment',()=>{
 for(const patch of [{status:'pending'},{transaction_amount:401},{currency_id:'USD'},{external_reference:'wrong'},{collector_id:456},{live_mode:true},{transaction_amount_refunded:1},{id:null}]){
  assert.throws(()=>verifyApprovedPayment({...payment,...patch},expected));
 }
 assert.throws(()=>verifyApprovedPayment(payment,{...expected,amountArs:0}));
});
