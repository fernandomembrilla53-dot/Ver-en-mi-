import {commissionCheckoutReady} from './mp-commission-checkout.mjs';
import {verifyApprovedPayment} from './mp-verification.mjs';
import {verifyWebhook} from './mp-webhook.mjs';

export async function reconcileCommission(env,id,payment,fetcher=fetch){
 if(!commissionCheckoutReady(env))return 503;
 if(!/^[0-9a-f-]{36}$/.test(id??'')||!/^[1-9]\d{0,19}$/.test(payment??''))return 400;
 const db=env.DB;
 const intent=await db.prepare('SELECT * FROM commission_checkout_intents WHERE id=?').bind(id).first();
 if(!intent||intent.collector_id!==env.MP_COMMISSION_COLLECTOR_ID)return 409;
 const response=await fetcher('https://api.mercadopago.com/v1/payments/'+payment,{headers:{Authorization:'Bearer '+env.MP_COMMISSION_ACCESS_TOKEN},signal:AbortSignal.timeout(15000)});
 if(!response.ok)return 503;
 const p=await response.json();
 if(String(p.id)!==payment)return 409;
 if(p.status!=='approved'||p.transaction_amount_refunded!==0)return 202;
 let verified;
 try{verified=verifyApprovedPayment(p,{reference:intent.external_reference,amountArs:intent.amount_ars,collectorId:intent.collector_id,liveMode:false});}catch{return 409;}
 const prior=await db.prepare('SELECT provider_reference FROM commission_settlements WHERE id=?').bind(id).first();
 if(prior)return prior.provider_reference===verified.providerReference?200:409;
 try{
 await db.batch([
 db.prepare("INSERT INTO commission_settlements(id,driver_id,provider_reference,amount_ars,verified_at) SELECT id,driver_id,?,amount_ars,? FROM commission_checkout_intents WHERE id=? AND status IN ('creating','ready','review') AND NOT EXISTS(SELECT 1 FROM commission_settlements WHERE id=? OR provider_reference=?)").bind(verified.providerReference,Date.now(),id,id,verified.providerReference),
 db.prepare("UPDATE commission_checkout_intents SET status='paid' WHERE id=? AND EXISTS(SELECT 1 FROM commission_settlements WHERE id=? AND provider_reference=?)").bind(id,id,verified.providerReference)
 ]);
 }catch{
 await db.prepare("UPDATE commission_checkout_intents SET status='review' WHERE id=? AND status IN ('creating','ready')").bind(id).run();
 return 503;
 }
 const saved=await db.prepare('SELECT provider_reference FROM commission_settlements WHERE id=?').bind(id).first();
 return saved?.provider_reference===verified.providerReference?200:409;
}
export async function receiveCommission(env,req,fetcher=fetch){
 if(!commissionCheckoutReady(env)||!env.MP_COMMISSION_WEBHOOK_SECRET)return 503;
 if(!await verifyWebhook({url:req.url,signature:req.headers.get('x-signature'),requestId:req.headers.get('x-request-id'),secret:env.MP_COMMISSION_WEBHOOK_SECRET}))return 401;
 const q=new URL(req.url).searchParams;
 if(q.getAll('settlement').length!==1||q.getAll('data.id').length!==1)return 400;
 return reconcileCommission(env,q.get('settlement'),q.get('data.id'),fetcher);
}
