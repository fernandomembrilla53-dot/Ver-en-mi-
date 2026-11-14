import test from "node:test";
import assert from "node:assert/strict";
import worker from "../backend/worker.mjs";
import {localD1} from "./helpers/local-d1.mjs";
import {gmailReady,sendGmailCode} from "../backend/gmail.mjs";
const settings={EMAIL_PROVIDER:"gmail",GMAIL_SENDER_EMAIL:"sender@example.invalid",GMAIL_CLIENT_ID:"fake-client",GMAIL_CLIENT_SECRET:"fake-secret",GMAIL_REFRESH_TOKEN:"fake-refresh"};
test("Gmail provider sends OTP via OAuth, accepts one login and rejects reuse",async t=>{
 const DB=localD1();t.after(()=>DB.close());const env={...settings,DB,AUTH_SECRET:"offline-only-secret-12345678901234567890",ENABLE_LIVE_RIDES:"false"};
 let code,requests=0;
 t.mock.method(globalThis,"fetch",async(url,options)=>{
  requests++;
  if(url==="https://oauth2.googleapis.com/token"){assert.equal(new URLSearchParams(options.body).get("refresh_token"),"fake-refresh");return Response.json({access_token:"fake-access"});}
  assert.equal(url,"https://gmail.googleapis.com/gmail/v1/users/me/messages/send");assert.equal(options.headers.Authorization,"Bearer fake-access");
  const mime=Buffer.from(JSON.parse(options.body).raw,"base64url").toString("utf8");
  assert.match(mime,/From: BM Viajes <sender@example.invalid>/);assert.match(mime,/To: passenger@example.invalid/);
  const text=Buffer.from(mime.split("\r\n\r\n")[1],"base64").toString("utf8");code=text.match(/\b\d{6}\b/)[0];
  return Response.json({id:"fake-message"});
 });
 const post=(path,body)=>worker.fetch(new Request("https://test.invalid/api/auth/"+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),env);
 assert.equal(gmailReady(env),true);
 assert.equal((await post("start",{email:"passenger@example.invalid"})).status,200);
 assert.equal(requests,2);
 const verify=await post("verify",{email:"passenger@example.invalid",code});assert.equal(verify.status,200);assert.match((await verify.json()).token,/^[a-f0-9]{64}$/);
 assert.equal((await post("verify",{email:"passenger@example.invalid",code})).status,401);
});
test("Gmail OAuth failure deletes OTP and does not expose credentials or fall back to Brevo",async t=>{
 const DB=localD1();t.after(()=>DB.close());
 const env={...settings,DB,AUTH_SECRET:"offline-only-secret-12345678901234567890",BREVO_API_KEY:"fake",MAIL_FROM:"sender@example.invalid"};
 let calls=0;t.mock.method(globalThis,"fetch",async(url)=>{calls++;assert.equal(url,"https://oauth2.googleapis.com/token");return new Response("private", {status:400});});
 const r=await worker.fetch(new Request("https://test.invalid/api/auth/start",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"passenger@example.invalid"})}),env);
 assert.equal(r.status,503);assert.equal(calls,1);assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM otp_challenges").first()).n,0);assert.doesNotMatch(await r.text(),/fake-secret|private/);
});
test("Gmail refuses header injection and incomplete credentials before network",async t=>{
 let calls=0;t.mock.method(globalThis,"fetch",async()=>{calls++;throw Error("unexpected");});
 assert.equal(gmailReady({...settings,GMAIL_REFRESH_TOKEN:""}),false);
 await assert.rejects(sendGmailCode(settings,"x@example.invalid\r\nBcc: y@example.invalid","123456"));
 assert.equal(calls,0);
});
