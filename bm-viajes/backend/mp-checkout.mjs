// Sandbox-only checkout. Reserve before calling provider; ambiguous failures require review.
import {ridePreference} from './mp-security.mjs';
import {unseal} from './mp-vault.mjs';
import {sandboxReady} from './mp-oauth.mjs';
export async function createRideCheckout(env,user,rideId,fetcher=fetch){
 if(!sandboxReady(env)||!env.MP_WEBHOOK_URL)throw Error('Checkout unavailable');
 const db=env.DB;
 const r=await db.prepare(`SELECT r.id,r.driver_id,t.total_ars,t.commission_ars,a.seller_id,a.token_cipher,a.expires_at FROM rides r JOIN ride_totals t ON t.ride_id=r.id JOIN ride_payment_methods m ON m.ride_id=r.id JOIN mp_driver_accounts a ON a.driver_id=r.driver_id WHERE r.id=? AND r.rider_id=? AND r.status='completed' AND m.method='mercadopago'`).bind(rideId,user.id).first();
 if(!r||r.expires_at<=Date.now())throw Error('Ride or seller unavailable');
 const previous=await db.prepare('SELECT status,checkout_url FROM mp_checkout_intents WHERE ride_id=?').bind(rideId).first();
 if(previous){if(previous.status==='ready')return {checkout_url:previous.checkout_url};throw Error('Checkout requires reconciliation');}
 const body=ridePreference({rideId,total:r.total_ars,commission:r.commission_ars,notificationUrl:env.MP_WEBHOOK_URL});
 const token=(await unseal(env.MP_VAULT_KEY,r.driver_id,r.token_cipher)).access_token;
 const reserved=await db.prepare("INSERT INTO mp_checkout_intents(ride_id,seller_id,external_reference,status,created_at) VALUES(?,?,?,'creating',?) ON CONFLICT(ride_id) DO NOTHING").bind(rideId,r.seller_id,body.external_reference,Date.now()).run();
 if(reserved.meta.changes!==1)throw Error('Checkout already reserved');
 try{
  const response=await fetcher('https://api.mercadopago.com/checkout/preferences',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok)throw Error('Provider rejected preference');
  const p=await response.json(),url=new URL(p.sandbox_init_point);
  if(typeof p.id!=='string'||!p.id||url.protocol!=='https:'||url.username||url.password||!['sandbox.mercadopago.com.ar','sandbox.mercadopago.com'].includes(url.hostname))throw Error('Invalid sandbox preference');
  const saved=await db.prepare("UPDATE mp_checkout_intents SET status='ready',preference_id=?,checkout_url=? WHERE ride_id=? AND status='creating'").bind(p.id,url.href,rideId).run();
  if(saved.meta.changes!==1)throw Error('Checkout state changed');
  return {checkout_url:url.href};
 }catch(e){await db.prepare("UPDATE mp_checkout_intents SET status='review' WHERE ride_id=? AND status='creating'").bind(rideId).run();throw Error('Checkout requires reconciliation');}
}
