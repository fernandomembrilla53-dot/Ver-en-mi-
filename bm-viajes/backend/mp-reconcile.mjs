import {sandboxReady} from './mp-oauth.mjs';
import {refreshDriverToken} from './mp-refresh.mjs';
import {unseal} from './mp-vault.mjs';
import {reconcilePayment} from './mp-receive.mjs';

// Read-only provider search; never creates a preference, payment or refund.
// Rotate through candidates by time slot so old unresolved rows cannot starve new ones.
export async function reconcilePending(env,fetcher=fetch,now=Date.now()){
 if(!sandboxReady(env))return {checked:0,verified:0,review:0};
 const db=env.DB;
 const count=await db.prepare("SELECT COUNT(*) AS n FROM mp_checkout_intents WHERE status IN ('ready','review','paid')").first();
 const n=Number(count?.n||0);
 if(!n)return {checked:0,verified:0,review:0};
 const offset=(Math.floor(now/600000)*5)%n;
 const rows=(await db.prepare(`SELECT i.ride_id,i.seller_id,i.external_reference,r.driver_id,p.payment_id FROM mp_checkout_intents i JOIN rides r ON r.id=i.ride_id LEFT JOIN mp_verified_payments p ON p.ride_id=i.ride_id WHERE i.status IN ('ready','review','paid') ORDER BY i.created_at,i.ride_id LIMIT 5 OFFSET ?`).bind(offset).all()).results;
 const result={checked:0,verified:0,review:0};
 for(const row of rows){
  result.checked++;
  try{
   let id;
   if(row.payment_id){
    if(!/^mp:[1-9]\d{0,19}$/.test(row.payment_id))throw Error('Invalid reference');
    id=row.payment_id.slice(3);
   }else{
    const account=await refreshDriverToken(env,row.driver_id,fetcher,Date.now,row.seller_id);
    const token=(await unseal(env.MP_VAULT_KEY,row.driver_id,account.token_cipher)).access_token;
    const url=new URL('https://api.mercadopago.com/v1/payments/search');
    url.searchParams.set('external_reference',row.external_reference);
    url.searchParams.set('limit','20');
    const response=await fetcher(url.href,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('Search failed');
    const body=await response.json();
    if(!Array.isArray(body.results)||!Number.isSafeInteger(body.paging?.total)||body.paging.total>body.results.length)throw Error('Incomplete search');
    const matches=body.results.filter(p=>p.external_reference===row.external_reference&&String(p.collector_id)===row.seller_id&&p.live_mode===false&&p.status==='approved');
    if(matches.length!==1)throw Error('No unique approved payment');
    id=String(matches[0].id);
   }
   const status=await reconcilePayment(env,row.ride_id,id,fetcher);
   if(status===200)result.verified++;else result.review++;
  }catch{result.review++;}
 }
 return result;
}
