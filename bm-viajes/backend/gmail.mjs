// Transactional Gmail API for BM Viajes. Only gmail.send is required.
const validEmail=value=>typeof value==="string"&&value.length<=254&&/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(value);
export function gmailReady(env){
 return validEmail(env.GMAIL_SENDER_EMAIL)&&!!(env.GMAIL_CLIENT_ID&&env.GMAIL_CLIENT_SECRET&&env.GMAIL_REFRESH_TOKEN);
}
function b64(bytes){let s="";for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
const enc=new TextEncoder();
function mime(sender,to,code){
 if(!validEmail(sender)||!validEmail(to)||!/^\d{6}$/.test(code))throw Error("Invalid mail");
 const subject="=?UTF-8?B?"+b64(enc.encode("Tu código de acceso a BM Viajes"))+"?=";
 const text="Tu código de BM Viajes es "+code+". Caduca en 10 minutos. Si no lo solicitaste, ignorá este mensaje.";
 return ["From: BM Viajes <"+sender+">","To: "+to,"Subject: "+subject,"MIME-Version: 1.0","Content-Type: text/plain; charset=UTF-8","Content-Transfer-Encoding: base64","",b64(enc.encode(text)).match(/.{1,76}/g).join("\r\n")].join("\r\n");
}
export async function sendGmailCode(env,to,code){
 if(!gmailReady(env))throw Error("Gmail not configured");
 const raw=b64(enc.encode(mime(env.GMAIL_SENDER_EMAIL,to,code))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
 const body=new URLSearchParams({client_id:env.GMAIL_CLIENT_ID,client_secret:env.GMAIL_CLIENT_SECRET,refresh_token:env.GMAIL_REFRESH_TOKEN,grant_type:"refresh_token"});
 const tokenResponse=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:body.toString()});
 if(!tokenResponse.ok)throw Error("OAuth failed");
 const token=await tokenResponse.json();
 if(typeof token.access_token!=="string"||!token.access_token)throw Error("Missing access token");
 const response=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",{method:"POST",headers:{Authorization:"Bearer "+token.access_token,"Content-Type":"application/json"},body:JSON.stringify({raw})});
 if(!response.ok)throw Error("Gmail rejected send");
}
