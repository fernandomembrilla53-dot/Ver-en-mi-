const enc=new TextEncoder();
export async function verifyWebhook({url,signature,requestId,secret,now=Date.now(),maxSkewMs=300000}){
 if(typeof secret!=='string'||!secret||typeof signature!=='string'||typeof requestId!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(requestId))return false;
 const fields=signature.split(',').map(x=>x.trim().split('='));
 if(fields.length!==2||fields.some(x=>x.length!==2)||new Set(fields.map(x=>x[0])).size!==2)return false;
 const {ts,v1}=Object.fromEntries(fields);
 if(!/^\d{10,13}$/.test(ts??'')||! /^[a-f0-9]{64}$/i.test(v1??''))return false;
 const time=Number(ts)*(ts.length===10?1000:1);
 if(!Number.isFinite(time)||Math.abs(now-time)>maxSkewMs)return false;
 let ids;try{ids=new URL(url).searchParams.getAll('data.id');}catch{return false;}
 if(ids.length!==1||! /^[A-Za-z0-9_-]{1,100}$/.test(ids[0]))return false;
 const manifest=`id:${ids[0].toLowerCase()};request-id:${requestId};ts:${ts};`;
 const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const bytes=Uint8Array.from(v1.match(/../g),x=>parseInt(x,16));
 return crypto.subtle.verify('HMAC',key,bytes,enc.encode(manifest));
}
