import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../backend/worker.mjs';
import {localD1} from './helpers/local-d1.mjs';
async function fixture(t){
 const DB=localD1();t.after(()=>DB.close());
 const env={DB,AUTH_SECRET:'offline-test-secret-with-32-characters',DOCUMENT_VAULT_KEY:Buffer.alloc(32,7).toString('base64'),ENABLE_LIVE_RIDES:'false',FRONTEND_ORIGIN:'https://test.invalid'};
 const users={};for(const role of ['admin','driver','passenger','other']){
  const id=crypto.randomUUID(),token=crypto.randomUUID().replaceAll('-','').repeat(2),hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
  await DB.prepare('INSERT INTO users VALUES(?,?,?,?)').bind(id,role+'@example.invalid','none',Date.now()).run();
  await DB.prepare('INSERT INTO sessions VALUES(?,?,?,?)').bind(hash,id,Date.now()+1000000,Date.now()).run();users[role]={id,token};
 }
 await DB.prepare('INSERT INTO admin_users VALUES(?)').bind(users.admin.id).run();
 const call=async(role,path,body,status=200)=>{const res=await worker.fetch(new Request('https://test.invalid/api'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+users[role].token,'Content-Type':'application/json','CF-Connecting-IP':users[role].id},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);const data=await res.json();assert.equal(res.status,status,JSON.stringify(data));return data;};
 return {DB,env,users,call};
}
test('administrative permissions, encrypted documents, approval and immutable audit',async t=>{
 const {DB,users,call}=await fixture(t),id=users.driver.id;
 await call('passenger','/admin/overview',undefined,403);
 await call('driver','/driver/profile',{display_name:'Chofer ficticio',vehicle:'Auto de prueba',plate:'AA123BB'});
 await call('admin','/admin/drivers/'+id,{status:'approved',reason:'No debe aprobar sin documentos'},409);
 const image=Buffer.from([255,216,255,224,0,16,1,2,3]).toString('base64');
 for(const kind of ['identity','license','permit','insurance','vtv']){
  await call('driver','/driver/documents',{kind,expires_at:Date.now()+86400000,mime:'image/jpeg',data:image});
  const row=await DB.prepare('SELECT cipher FROM driver_documents WHERE user_id=? AND kind=?').bind(id,kind).first();assert.ok(!row.cipher.includes(image));
  await call('other','/admin/drivers/'+id+'/documents/'+kind,undefined,403);
  assert.equal((await call('admin','/admin/drivers/'+id+'/documents/'+kind)).document.data,image);
  await call('admin','/admin/drivers/'+id+'/documents/'+kind,{status:'approved',reason:'Documento ficticio revisado'});
 }
 await call('admin','/admin/drivers/'+id,{status:'approved',reason:'Cinco documentos revisados'});
 assert.equal((await call('driver','/me')).user.driver_status,'approved');
 await call('driver','/driver/availability',{available:true,lat:-37.15,lng:-58.48,accuracy_m:20},503);
 await call('driver','/driver/availability',{available:false});
 await assert.rejects(DB.prepare("UPDATE admin_audit SET reason='alterado'").run(),/immutable/);
 await call('admin','/admin/users/'+id+'/block',{blocked:true,reason:'Suspensión de prueba'});
 await call('driver','/me',undefined,401);
});
test('incidents belong to the reporter; settlement and undefined tariff stay blocked',async t=>{
 const {users,call}=await fixture(t);
 const incident=await call('passenger','/incidents',{message:'Incidencia ficticia'},201);
 assert.equal((await call('other','/incidents')).incidents.length,0);
 await call('admin','/admin/incidents/'+incident.id,{reason:'Revisión ficticia finalizada'});
 assert.equal((await call('passenger','/incidents')).incidents[0].status,'resolved');
 await call('admin','/admin/settlements',{driver_id:users.driver.id,amount_ars:400,bank_verified:true,reason:'Ficticio',provider_reference:'test'},503);
 assert.equal((await call('admin','/admin/tariffs',{kind:'rural',amount_ars:10000,reason:'Solo propuesta'})).active,false);
});
test('fare and final totals reject database mutation',async t=>{
 const {DB,users}=await fixture(t),id=crypto.randomUUID(),now=Date.now();
 await DB.prepare("INSERT INTO rides VALUES(?,?,?,?,?,?,?,?,'completed',?,?,?)").bind(id,users.passenger.id,users.driver.id,-37.15,-58.48,-37.16,-58.49,1,now,now,now).run();
 await DB.prepare("INSERT INTO ride_fares VALUES(?,'one_way','v1',4000,1000,0,0,?)").bind(id,now).run();
 await DB.prepare('INSERT INTO ride_totals VALUES(?,0,0,4000,400,?)').bind(id,now).run();
 await assert.rejects(DB.prepare('UPDATE ride_fares SET base_ars=1').run(),/immutable/);
 await assert.rejects(DB.prepare('DELETE FROM ride_totals').run(),/immutable/);
});
