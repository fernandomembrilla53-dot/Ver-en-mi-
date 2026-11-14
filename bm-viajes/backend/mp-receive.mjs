import {verifiedReversal} from './mp-reversal.mjs';
import {storeReversal} from './mp-reversal-store.mjs';
import {verifyWebhook} from './mp-webhook.mjs';
import {verifyApprovedPayment} from './mp-verification.mjs';
import {sandboxReady} from './mp-oauth.mjs';
import {unseal} from './mp-vault.mjs';
// The ride hint is untrusted: provider identity, reference and amount must all match.
export async function receivePayment(env,req,fetcher=fetch){
 if(!sandboxReady(env)||!env.MP_WEBHOOK_SECRET)return 503;
 if(!await verifyWebhook({url:req.url,signature:req.headers.get('x-signature'),requestId:req.headers.get('x-request-id'),secret:env.MP_WEBHOOK_SECRET}))return 401;
 const q=new URL(req.url).searchParams,ride=q.get('ride'),payment=q.get('data.id');
 if(q.getAll('ride').length!==1||! /^[0-9a-f-]{36}$/.test(ride??'')||! /^[1-9]\d{0,19}$/.test(payment??''))return 400;
 const db=env.DB;
 const r=await db.prepare(`SELECT i.ride_id,i.seller_id,i.external_reference,i.status,t.total_ars,r.driver_id,a.token_cipher,a.expires_at FROM mp_checkout_intents i JOIN ride_totals t ON t.ride_id=i.ride_id JOIN rides r ON r.id=i.ride_id JOIN mp_driver_accounts a ON a.driver_id=r.driver_id AND a.seller_id=i.seller_id WHERE i.ride_id=?`).bind(ride).first();
 if(!r||r.expires_at<=Date.now())return 503;
 const token=(await unseal(env.MP_VAULT_KEY,r.driver_id,r.token_cipher)).access_token;
 const response=await fetcher('https://api.mercadopago.com/v1/payments/'+payment,{headers:{Authorization:'Bearer '+token}});
 if(!response.ok)return 503;
 const p=await response.json();
 if(String(p.id)!==payment)return 409;
 const prior=await db.prepare('SELECT payment_id,amount_ars FROM mp_verified_payments WHERE ride_id=?').bind(ride).first();
 if(prior){
   if(prior.payment_id!==payment)return 409;
   let reversal;try{reversal=verifiedReversal(p,{paymentId:payment,reference:r.external_reference,amountArs:prior.amount_ars,collectorId:r.seller_id});}catch{return 409;}
   await storeReversal(db,payment,ride,reversal);
   return 200;
 }
 if(p.status!=='approved'||p.transaction_amount_refunded!==0)return 202; // unverified reversal requires review
 let verified;try{verified=verifyApprovedPayment(p,{reference:r.external_reference,amountArs:r.total_ars,collectorId:r.seller_id,liveMode:false});}catch{return 409;}
 await db.batch([
 db.prepare("INSERT INTO mp_verified_payments(payment_id,ride_id,amount_ars,verified_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM mp_checkout_intents WHERE ride_id=? AND status IN ('ready','review','paid')) ON CONFLICT DO NOTHING").bind(verified.providerReference,ride,verified.amountArs,Date.now(),ride),
 db.prepare("UPDATE mp_checkout_intents SET status='paid' WHERE ride_id=? AND status IN ('ready','review','paid') AND EXISTS(SELECT 1 FROM mp_verified_payments WHERE ride_id=? AND payment_id=?)").bind(ride,ride,verified.providerReference)
 ]);
 const saved=await db.prepare('SELECT payment_id FROM mp_verified_payments WHERE ride_id=?').bind(ride).first();
 return saved?.payment_id===verified.providerReference?200:409;
}
