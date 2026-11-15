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


export async function reconcileCommissionPending(env,fetcher=fetch,now=Date.now()){
 if(!commissionCheckoutReady(env))return {checked:0,verified:0,review:0};
 const db=env.DB,result={checked:0,verified:0,review:0};
 const count=await db.prepare("SELECT COUNT(*) AS n FROM commission_checkout_intents WHERE status IN ('creating','ready','review','paid')").first();
 const n=Number(count?.n||0);if(!n)return result;
 const offset=(Math.floor(now/600000)*5)%n;
 const rows=(await db.prepare("SELECT i.id,i.external_reference,i.collector_id,s.provider_reference FROM commission_checkout_intents i LEFT JOIN commission_settlements s ON s.id=i.id WHERE i.status IN ('creating','ready','review','paid') ORDER BY i.created_at,i.id LIMIT 5 OFFSET ?").bind(offset).all()).results;
 for(const row of rows){
  result.checked++;
  try{
   if(row.collector_id!==env.MP_COMMISSION_COLLECTOR_ID)throw Error('Collector mismatch');
   let payment;
   if(row.provider_reference){
    if(!/^mp:[1-9]\d{0,19}$/.test(row.provider_reference))throw Error('Invalid payment reference');
    payment=row.provider_reference.slice(3);
   }else{
    const url='https://api.mercadopago.com/v1/payments/search?external_reference='+encodeURIComponent(row.external_reference)+'&limit=20';
    const response=await fetcher(url,{headers:{Authorization:'Bearer '+env.MP_COMMISSION_ACCESS_TOKEN},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('Search failed');
    const body=await response.json();
    if(!Array.isArray(body.results)||!Number.isSafeInteger(body.paging?.total)||body.paging.total>body.results.length)throw Error('Incomplete search');
    const matches=body.results.filter(p=>p.external_reference===row.external_reference&&String(p.collector_id)===row.collector_id&&p.live_mode===false&&p.status==='approved');
    if(matches.length!==1)throw Error('No unique approved payment');
    payment=String(matches[0].id);
   }
   if(await reconcileCommission(env,row.id,payment,fetcher)===200)result.verified++;else result.review++;
  }catch{result.review++;}
 }
 return result;
}
