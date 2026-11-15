import test from 'node:test';import assert from 'node:assert/strict';import {createHmac,webcrypto} from 'node:crypto';import {verifyWebhook} from '../backend/mp-webhook.mjs';
globalThis.crypto??=webcrypto;
const now=1760000000000,ts='1760000000',secret='fake-secret',requestId='req-123',url='https://example.invalid/webhook?data.id=ABC123';
const v1=createHmac('sha256',secret).update(`id:abc123;request-id:${requestId};ts:${ts};`).digest('hex');
const base={url,signature:`ts=${ts},v1=${v1}`,requestId,secret,now};
test('valid signed notification',async()=>assert.equal(await verifyWebhook(base),true));
test('reject tampering, replay and malformed input',async()=>{for(const change of [{url:url+'4'},{requestId:'other'},{secret:'wrong'},{now:now+300001},{signature:base.signature+',ts='+ts},{url:url+'&data.id=ABC123'},{signature:'v1=bad'},{secret:''}])assert.equal(await verifyWebhook({...base,...change}),false);});
