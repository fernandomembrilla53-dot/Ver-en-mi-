import {oauthChallenge,authorizationUrl} from './mp-security.mjs';
import {seal,unseal} from './mp-vault.mjs';
const digest=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
export function sandboxReady(env){return env.MP_SANDBOX_ENABLED==='true'&&env.ENABLE_LIVE_RIDES!=='true'&&!!env.MP_CLIENT_ID&&!!env.MP_CLIENT_SECRET&&!!env.MP_REDIRECT_URI&&!!env.MP_VAULT_KEY;}
export async function beginOAuth(env,user){
 if(!sandboxReady(env)||user.driver_status!=='approved')throw Error('OAuth unavailable');
 const {state,verifier,challenge}=await oauthChallenge();
 const cipher=await seal(env.MP_VAULT_KEY,user.id,{access_token:verifier,refresh_token:'oauth-state'});
 await env.DB.prepare('INSERT INTO mp_oauth_states(state_hash,driver_id,verifier_cipher,expires_at) VALUES(?,?,?,?)').bind(await digest(state),user.id,cipher,Date.now()+600000).run();
 return authorizationUrl({clientId:env.MP_CLIENT_ID,redirectUri:env.MP_REDIRECT_URI,state,challenge});
}
export async function finishOAuth(env,state,code,fetcher=fetch){
 if(!sandboxReady(env)||!/^[-_a-zA-Z0-9]{43}$/.test(state)||typeof code!=='string'||!code||code.length>2048)throw Error('Invalid OAuth callback');
 const row=await env.DB.prepare('DELETE FROM mp_oauth_states WHERE state_hash=? AND expires_at>? RETURNING driver_id,verifier_cipher').bind(await digest(state),Date.now()).first();
 if(!row)throw Error('Expired or used OAuth state');
 const user=await env.DB.prepare("SELECT id FROM users WHERE id=? AND driver_status='approved'").bind(row.driver_id).first();
 if(!user)throw Error('Driver unavailable');
 const verifier=(await unseal(env.MP_VAULT_KEY,row.driver_id,row.verifier_cipher)).access_token;
 const response=await fetcher('https://api.mercadopago.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:env.MP_CLIENT_ID,client_secret:env.MP_CLIENT_SECRET,grant_type:'authorization_code',code,redirect_uri:env.MP_REDIRECT_URI,code_verifier:verifier})});
 if(!response.ok)throw Error('OAuth exchange failed');
 const t=await response.json();
 if(t.live_mode!==false||!t.access_token||!t.refresh_token||!/^\d+$/.test(String(t.user_id))||!Number.isSafeInteger(t.expires_in)||t.expires_in<=0)throw Error('Invalid sandbox token response');
 const cipher=await seal(env.MP_VAULT_KEY,row.driver_id,{access_token:t.access_token,refresh_token:t.refresh_token});
 await env.DB.prepare('INSERT INTO mp_driver_accounts(driver_id,seller_id,token_cipher,expires_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(driver_id) DO UPDATE SET seller_id=excluded.seller_id,token_cipher=excluded.token_cipher,expires_at=excluded.expires_at,updated_at=excluded.updated_at').bind(row.driver_id,String(t.user_id),cipher,Date.now()+t.expires_in*1000,Date.now()).run();
 return {connected:true};
}
