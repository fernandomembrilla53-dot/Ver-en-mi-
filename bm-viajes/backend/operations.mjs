import {adminFinances,driverFinance,checkDebtForNewRide} from "./finance.mjs";
// Administrative actions are transactional with an immutable audit record.
const kinds=['identity','license','permit','insurance','vtv'];
export async function operations(req,env,user,{json,error,input,access,ApiError}) {
 const url=new URL(req.url),path=url.pathname,method=req.method,db=env.DB;
 const body=()=>input(req);
 const fail=(s,n=400)=>{throw new ApiError(s,n);};
 const text=(v,max=200)=>{if(typeof v!=='string'||!v.trim()||v.length>max)fail('Texto inválido.');return v.trim();};
 const rows=async(sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
 const audit=(action,target,reason)=>db.prepare('INSERT INTO admin_audit VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),user.id,action,target,reason,Date.now());
 const isAdmin=!!await db.prepare('SELECT user_id FROM admin_users WHERE user_id=?').bind(user.id).first();
 if(path==='/api/capabilities'&&method==='GET')return json({ok:true,admin:isAdmin});
 if(path==='/api/driver/profile'){
  if(method==='GET')return json({ok:true,profile:await db.prepare('SELECT * FROM driver_profiles WHERE user_id=?').bind(user.id).first(),documents:await rows('SELECT kind,expires_at,review_status,uploaded_at FROM driver_documents WHERE user_id=?',user.id)});
  if(method==='POST'){
   const b=await body(),name=text(b.display_name,80),vehicle=text(b.vehicle,100),plate=text(b.plate,12).toUpperCase();
   if(!/^[A-Z0-9 -]{6,12}$/.test(plate))fail('Patente inválida.');
   await db.batch([db.prepare('INSERT INTO driver_profiles VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,vehicle=excluded.vehicle,plate=excluded.plate,updated_at=excluded.updated_at').bind(user.id,name,vehicle,plate,Date.now()),db.prepare("UPDATE users SET driver_status='pending' WHERE id=? AND driver_status<>'suspended'").bind(user.id)]);
   return json({ok:true});
  }
 }
 if(path==='/api/driver/documents'&&method==='POST'){
  const b=await body();if(!kinds.includes(b.kind)||!Number.isSafeInteger(b.expires_at)||b.expires_at<=Date.now()||b.expires_at>Date.now()+20*366*86400000)fail('Documento o vencimiento inválido.');
  if(!env.DOCUMENT_VAULT_KEY)fail('Archivo privado pendiente de configuración.',503);
  if(!['image/jpeg','image/png'].includes(b.mime)||typeof b.data!=='string'||b.data.length>120000||! /^[A-Za-z0-9+/]+={0,2}$/.test(b.data))fail('Usá una imagen JPG o PNG de hasta 90 KB.');
  const bytes=Uint8Array.from(atob(b.data),c=>c.charCodeAt(0));
  if(b.mime==='image/jpeg'&&!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)||b.mime==='image/png'&&![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))fail('Imagen inválida.');
  const cipher=await crypt(env,user.id+':'+b.kind,{mime:b.mime,data:b.data});
  await db.batch([db.prepare("INSERT INTO driver_documents VALUES(?,?,?,?,'pending',?) ON CONFLICT(user_id,kind) DO UPDATE SET cipher=excluded.cipher,expires_at=excluded.expires_at,review_status='pending',uploaded_at=excluded.uploaded_at").bind(user.id,b.kind,cipher,b.expires_at,Date.now()),db.prepare("UPDATE users SET driver_status='pending' WHERE id=? AND driver_status<>'suspended'").bind(user.id)]);
  return json({ok:true,status:'pending'});
 }
 if(path==='/api/driver/availability'){
  if(user.driver_status!=='approved')fail('Conductor sin aprobación.',403);
  if(method==='GET')return json({ok:true,availability:await db.prepare('SELECT available,updated_at FROM driver_availability WHERE user_id=?').bind(user.id).first()});
  if(method==='POST'){
   const b=await body();if(typeof b.available!=='boolean')fail('Disponibilidad inválida.');
   if(b.available&&(env.ENABLE_LIVE_RIDES!=='true'))fail('Viajes reales deshabilitados.',503);
   if(b.available)await checkDebtForNewRide(env,user.id,ApiError);
   if(b.available&&(!Number.isFinite(b.lat)||!Number.isFinite(b.lng)||Math.abs(b.lat+37.1515)>.3||Math.abs(b.lng+58.4859)>.4||!Number.isFinite(b.accuracy_m)||b.accuracy_m>300||b.accuracy_m<0))fail('Ubicación reciente y precisa requerida.');
   await db.prepare('INSERT INTO driver_availability VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET available=excluded.available,lat=excluded.lat,lng=excluded.lng,updated_at=excluded.updated_at').bind(user.id,b.available?1:0,b.available?b.lat:null,b.available?b.lng:null,Date.now()).run();
   return json({ok:true});
  }
 }
 const declined=path.match(/^\/api\/rides\/([0-9a-f-]{36})\/decline$/);
 if(declined&&method==='POST'){
  if(user.driver_status!=='approved')fail('Conductor sin aprobación.',403);
  await db.prepare("INSERT INTO ride_declines SELECT id,?,? FROM rides WHERE id=? AND status='requested' ON CONFLICT DO NOTHING").bind(user.id,Date.now(),declined[1]).run();return json({ok:true});
 }
 if(path==='/api/driver/finance'&&method==='GET'){
  const offset=Number(url.searchParams.get('offset')||0);
  if(!Number.isSafeInteger(offset)||offset<0||offset>100000)fail('Página inválida.');
  return json(await driverFinance(env,user.id,{offset}));
 }
 if(path==='/api/driver/earnings'&&method==='GET'){
  const days=Number(url.searchParams.get('days')??'1');if(![1,7,30].includes(days))fail('Período inválido.');
  const since=Date.now()-days*86400000;
  const summary=await db.prepare(`SELECT COUNT(*) rides,COALESCE(SUM(t.total_ars),0) gross_ars,COALESCE(SUM(t.commission_ars),0) commission_ars,COALESCE(SUM(t.total_ars-t.commission_ars),0) net_ars FROM rides r JOIN ride_totals t ON t.ride_id=r.id WHERE r.driver_id=? AND t.finalized_at>=? AND ((SELECT COUNT(*) FROM cash_confirmations c WHERE c.ride_id=r.id)=2 OR EXISTS(SELECT 1 FROM mp_verified_payments p WHERE p.ride_id=r.id))`).bind(user.id,since).first();
  const reversals=await db.prepare('SELECT COALESCE(SUM(v.amount_ars),0) amount_ars FROM mp_payment_reversals v JOIN mp_verified_payments p ON p.payment_id=v.payment_id JOIN rides r ON r.id=p.ride_id WHERE r.driver_id=? AND v.observed_at>=?').bind(user.id,since).first();
  return json({ok:true,days,since,summary,reversals_ars:reversals.amount_ars,period:'rolling',note:'Importes brutos antes de costos del proveedor; reversiones informadas por separado.'});
 }
 const rated=path.match(/^\/api\/rides\/([0-9a-f-]{36})\/(rating|driver)$/);
 if(rated){
  const ride=await access(env,user,rated[1]);
  if(rated[2]==='driver'&&method==='GET')return json({ok:true,driver:ride.driver_id?await db.prepare('SELECT display_name,vehicle,plate FROM driver_profiles WHERE user_id=?').bind(ride.driver_id).first():null});
  if(rated[2]==='rating'&&method==='POST'){
   const b=await body();if(ride.status!=='completed'||ride.rider_id!==user.id)fail('Solo el pasajero de un viaje terminado puede calificar.',403);
   if(!Number.isInteger(b.stars)||b.stars<1||b.stars>5)fail('Calificación inválida.');
   await db.prepare('INSERT INTO ride_ratings VALUES(?,?,?,?,?) ON CONFLICT(ride_id) DO NOTHING').bind(ride.id,user.id,ride.driver_id,b.stars,Date.now()).run();
   return json({ok:true});
  }
 }
 if(path==='/api/incidents'){
  if(method==='GET')return json({ok:true,incidents:await rows('SELECT * FROM incidents WHERE user_id=? ORDER BY created_at DESC LIMIT 100',user.id)});
  if(method==='POST'){
   const b=await body(),message=text(b.message,2000);if(b.ride_id)await access(env,user,b.ride_id);
   const id=crypto.randomUUID();await db.prepare('INSERT INTO incidents(id,user_id,ride_id,message,created_at) VALUES(?,?,?,?,?)').bind(id,user.id,b.ride_id||null,message,Date.now()).run();return json({ok:true,id},201);
  }
 }
 if(!path.startsWith('/api/admin/'))return null;
 if(!isAdmin)fail('Acceso administrativo requerido.',403);
 if(path==='/api/admin/finance'&&method==='GET'){
  const offset=Number(url.searchParams.get('offset')||0),filter=url.searchParams.get('filter')||'all';
  if(!Number.isSafeInteger(offset)||offset<0||offset>100000||!['all','unpaid','overdue'].includes(filter))fail('Filtro o página inválidos.');
  return json(await adminFinances(env,{offset,filter}));
 }
 const financeDriver=path.match(/^\/api\/admin\/finance\/([0-9a-f-]{36})$/);
 if(financeDriver&&method==='GET'){
  const offset=Number(url.searchParams.get('offset')||0);
  if(!Number.isSafeInteger(offset)||offset<0||offset>100000)fail('Página inválida.');
  const statement=await driverFinance(env,financeDriver[1],{offset});
  if(!statement)fail('Conductor inexistente.',404);
  return json(statement);
 }
 if(path==='/api/admin/overview'&&method==='GET')return json({ok:true,
  users:await rows('SELECT u.id,u.email,u.driver_status,p.display_name,p.vehicle,p.plate,b.reason blocked_reason FROM users u LEFT JOIN driver_profiles p ON p.user_id=u.id LEFT JOIN blocked_users b ON b.user_id=u.id ORDER BY u.created_at DESC LIMIT 100'),
  rides:await rows('SELECT id,rider_id,driver_id,status,created_at FROM rides ORDER BY created_at DESC LIMIT 100'),
  incidents:await rows('SELECT * FROM incidents ORDER BY created_at DESC LIMIT 100'),
  audit:await rows('SELECT * FROM admin_audit ORDER BY created_at DESC LIMIT 100'),
  debts:await rows('SELECT u.id,u.email,(SELECT COALESCE(SUM(amount_ars),0) FROM driver_ledger WHERE driver_id=u.id)-(SELECT COALESCE(SUM(amount_ars),0) FROM commission_settlements WHERE driver_id=u.id) due_ars FROM users u WHERE u.driver_status<>\'none\''),
  reversals:await rows('SELECT * FROM mp_payment_reversals ORDER BY observed_at DESC LIMIT 100')});
 const doc=path.match(/^\/api\/admin\/drivers\/([0-9a-f-]{36})\/documents(?:\/(identity|license|permit|insurance|vtv))?$/);
 if(doc){
  if(method==='GET'&&!doc[2])return json({ok:true,documents:await rows('SELECT kind,expires_at,review_status FROM driver_documents WHERE user_id=?',doc[1])});
  if(method==='GET'&&doc[2]){
   const row=await db.prepare('SELECT cipher FROM driver_documents WHERE user_id=? AND kind=?').bind(doc[1],doc[2]).first();if(!row)fail('Documento inexistente.',404);
   const document=await crypt(env,doc[1]+':'+doc[2],row.cipher,true);
   await audit('document_view',doc[1]+':'+doc[2],'Revisión de documentación').run();return json({ok:true,document});
  }
  if(method==='POST'&&doc[2]){
   const b=await body(),reason=text(b.reason,500);if(!['approved','rejected'].includes(b.status))fail('Estado inválido.');
   const row=await db.prepare('SELECT uploaded_at,expires_at FROM driver_documents WHERE user_id=? AND kind=?').bind(doc[1],doc[2]).first();if(!row||row.expires_at<Date.now())fail('Documento ausente o vencido.',409);
   await db.batch([db.prepare('UPDATE driver_documents SET review_status=? WHERE user_id=? AND kind=? AND uploaded_at=?').bind(b.status,doc[1],doc[2],row.uploaded_at),db.prepare("UPDATE users SET driver_status='pending' WHERE id=? AND driver_status='approved' AND ?='rejected'").bind(doc[1],b.status),audit('document_'+b.status,doc[1]+':'+doc[2],reason)]);return json({ok:true});
  }
 }
 const driver=path.match(/^\/api\/admin\/drivers\/([0-9a-f-]{36})$/);
 if(driver&&method==='POST'){
  const b=await body(),reason=text(b.reason,500);if(!['approved','rejected','suspended'].includes(b.status))fail('Estado inválido.');
  // Eligibility is rechecked inside the write to reject concurrent document replacement.
  const stmt=db.prepare("UPDATE users SET driver_status=? WHERE id=? AND (?<>'approved' OR (EXISTS(SELECT 1 FROM driver_profiles WHERE user_id=users.id) AND (SELECT COUNT(*) FROM driver_documents WHERE user_id=users.id AND review_status='approved' AND expires_at>?)=5 AND NOT EXISTS(SELECT 1 FROM blocked_users WHERE user_id=users.id)))").bind(b.status,driver[1],b.status,Date.now());
  const result=await db.batch([stmt,audit('driver_'+b.status+'_attempt',driver[1],reason)]);
  if(!result[0].meta.changes)fail('No cumple los requisitos de aprobación.',409);return json({ok:true});
 }
 const block=path.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/block$/);
 if(block&&method==='POST'){
  const b=await body(),reason=text(b.reason,500);if(block[1]===user.id)fail('No podés bloquear tu propia cuenta.');
  if(typeof b.blocked!=='boolean')fail('Estado inválido.');
  await db.batch([b.blocked?db.prepare('INSERT INTO blocked_users VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET reason=excluded.reason').bind(block[1],reason,Date.now()):db.prepare('DELETE FROM blocked_users WHERE user_id=?').bind(block[1]),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(block[1]),audit(b.blocked?'account_blocked':'account_unblocked',block[1],reason)]);return json({ok:true});
 }
 const incident=path.match(/^\/api\/admin\/incidents\/([0-9a-f-]{36})$/);
 if(incident&&method==='POST'){
  const b=await body(),reason=text(b.reason,2000);await db.batch([db.prepare("UPDATE incidents SET status='resolved',resolution=? WHERE id=?").bind(reason,incident[1]),audit('incident_resolved',incident[1],reason)]);return json({ok:true});
 }
 if(path==='/api/admin/settlements'&&method==='POST'){
  // Manual credits cannot be misrepresented as verified external payments in preparation mode.
  if(env.ENABLE_LIVE_RIDES!=='true')fail('Liquidaciones reales deshabilitadas durante la preparación.',503);
  const b=await body(),reason=text(b.reason,500),ref=text(b.provider_reference,200);
  if(!Number.isSafeInteger(b.amount_ars)||b.amount_ars<=0||b.bank_verified!==true)fail('Se requiere comprobación bancaria e importe válido.');
  try{await db.batch([db.prepare('INSERT INTO commission_settlements VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),text(b.driver_id,36),ref,b.amount_ars,Date.now()),audit('settlement_verified',b.driver_id,reason)]);}catch{fail('Referencia duplicada o importe superior a la deuda.',409);}return json({ok:true});
 }
 if(path==='/api/admin/tariffs'&&method==='POST'){
  const b=await body(),reason=text(b.reason,500);if(!['rural','night_round_trip'].includes(b.kind)||!Number.isSafeInteger(b.amount_ars)||b.amount_ars<=0)fail('Propuesta inválida.');
  await db.batch([db.prepare('INSERT INTO tariff_proposals VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),b.kind,b.amount_ars,reason,Date.now()),audit('tariff_proposed',b.kind,reason)]);return json({ok:true,active:false,message:'Propuesta guardada; modalidad bloqueada hasta aprobación comercial y legal e implementación verificada.'});
 }
 return error('Ruta no encontrada.',404);
}
async function crypt(env,scope,value,decrypt=false){
 const keyBytes=Uint8Array.from(atob(env.DOCUMENT_VAULT_KEY),x=>x.charCodeAt(0));
 const key=await crypto.subtle.importKey('raw',keyBytes,'AES-GCM',false,['encrypt','decrypt']);
 const aad=new TextEncoder().encode('BM-Viajes-document-v1:'+scope);
 if(decrypt){const b=JSON.parse(value);return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:Uint8Array.from(atob(b.iv),c=>c.charCodeAt(0)),additionalData:aad},key,Uint8Array.from(atob(b.data),c=>c.charCodeAt(0)))));}
 const iv=crypto.getRandomValues(new Uint8Array(12));const data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},key,new TextEncoder().encode(JSON.stringify(value))));
 let encoded='';for(const x of data)encoded+=String.fromCharCode(x);
 return JSON.stringify({iv:btoa(String.fromCharCode(...iv)),data:btoa(encoded)});
}
