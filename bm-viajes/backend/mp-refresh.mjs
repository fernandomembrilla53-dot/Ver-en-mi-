import {seal,unseal} from './mp-vault.mjs';
import {sandboxReady} from './mp-oauth.mjs';
// Lease prevents concurrent refreshes. CAS prevents overwriting a newer OAuth link.
export async function refreshDriverToken(env,driverId,fetcher=fetch,now=Date.now){
 if(!sandboxReady(env))throw Error('Sandbox unavailable');
 const db=env.DB, t=now();
 const row=await db.prepare('SELECT seller_id,token_cipher,expires_at,updated_at FROM mp_driver_accounts WHERE driver_id=?').bind(driverId).first();
 if(!row)throw Error('Seller unavailable');
 if(row.expires_at>t+60000)return row;
 const lease=Number.MAX_SAFE_INTEGER;
 const claim=await db.prepare('UPDATE mp_driver_accounts SET updated_at=? WHERE driver_id=? AND token_cipher=? AND updated_at=? AND updated_at<=?').bind(lease,driverId,row.token_cipher,row.updated_at,t).run();
 if(claim.meta.changes!==1)throw Error('Refresh in progress');
 // On ambiguous provider failure keep the lease; do not retry a rotating token blindly.
 const tokens=await unseal(env.MP_VAULT_KEY,driverId,row.token_cipher);
 const response=await fetcher('https://api.mercadopago.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:env.MP_CLIENT_ID,client_secret:env.MP_CLIENT_SECRET,grant_type:'refresh_token',refresh_token:tokens.refresh_token}),signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('Refresh failed');
 const result=await response.json();
 if(result.live_mode!==false||String(result.user_id)!==row.seller_id||typeof result.access_token!=='string'||!result.access_token||typeof result.refresh_token!=='string'||!result.refresh_token||!Number.isSafeInteger(result.expires_in)||result.expires_in<=0||result.expires_in>31536000)throw Error('Invalid sandbox refresh');
 const cipher=await seal(env.MP_VAULT_KEY,driverId,{access_token:result.access_token,refresh_token:result.refresh_token});
 const expires=now()+result.expires_in*1000;
 const saved=await db.prepare('UPDATE mp_driver_accounts SET token_cipher=?,expires_at=?,updated_at=? WHERE driver_id=? AND seller_id=? AND token_cipher=? AND updated_at=?').bind(cipher,expires,now(),driverId,row.seller_id,row.token_cipher,lease).run();
 if(saved.meta.changes!==1)throw Error('Authorization changed');
 return {seller_id:row.seller_id,token_cipher:cipher,expires_at:expires};
}
