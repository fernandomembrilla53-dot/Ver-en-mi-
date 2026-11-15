const enc=new TextEncoder();
const b64url=b=>btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export async function oauthChallenge(){
 const verifier=b64url(crypto.getRandomValues(new Uint8Array(32)));
 const state=b64url(crypto.getRandomValues(new Uint8Array(32)));
 const challenge=b64url(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(verifier))));
 return {verifier,state,challenge};
}
export function authorizationUrl({clientId,redirectUri,state,challenge}){
 const redirect=new URL(redirectUri);
 if(redirect.protocol!=='https:'||redirect.username||redirect.password||redirect.hash||!clientId||!state||!challenge)throw new Error('Invalid OAuth configuration');
 const url=new URL('https://auth.mercadopago.com/authorization');
 url.search=new URLSearchParams({client_id:clientId,redirect_uri:redirect.href,response_type:'code',state,code_challenge:challenge,code_challenge_method:'S256'});
 return url.href;
}
export function ridePreference({rideId,total,commission,notificationUrl}){
 if(!/^[0-9a-f-]{36}$/.test(rideId)||!Number.isSafeInteger(total)||total<=0||!Number.isSafeInteger(commission)||commission<0||commission>total)throw new Error('Invalid fare');
 const url=new URL(notificationUrl);if(url.protocol!=='https:'||url.username||url.password||url.hash)throw new Error('Invalid webhook URL');
 return {items:[{id:rideId,title:'Viaje BM Viajes',currency_id:'ARS',quantity:1,unit_price:total}],marketplace_fee:commission,external_reference:'bm-viajes:ride:'+rideId,notification_url:url.href};
}
