import { estimateUrbanFare, TARIFF } from "./tariff.mjs";
// BM Viajes - API piloto Cloudflare Workers + D1.
// Falla cerrado: sin ENABLE_LIVE_RIDES=true no acepta viajes reales.
// No incluye cobros: nunca simular un pago exitoso.
const CENTER={lat:-37.1515,lng:-58.4859};
const LIVE_STATES=["requested","accepted","in_progress"];
const json=(obj,status=200,headers={})=>new Response(JSON.stringify(obj),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...headers}});
const error=(message,status=400,headers={})=>json({ok:false,error:message},status,headers);
const safeEmail=(x)=>typeof x==="string"&&x.length<=254&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.trim())?x.trim().toLowerCase():null;
const sha256=async(value)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,"0")).join("");
const randomHex=(length=32)=>Array.from(crypto.getRandomValues(new Uint8Array(length))).map(x=>x.toString(16).padStart(2,"0")).join("");
const jsonInput=async(request)=>{
  if((request.headers.get("Content-Type")||"").split(";")[0].trim().toLowerCase()!=="application/json")throw new ApiError("Enviá JSON.",415);
  const limit=6000;
  const declared=request.headers.get("Content-Length");
  if(declared!==null&&Number(declared)>limit)throw new ApiError("Solicitud demasiado grande.",413);
  if(!request.body)throw new ApiError("JSON incorrecto.",400);
  const reader=request.body.getReader(),decoder=new TextDecoder("utf-8",{fatal:true});
  let size=0,raw="";
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>limit){await reader.cancel().catch(()=>{});throw new ApiError("Solicitud demasiado grande.",413);}
      raw+=decoder.decode(value,{stream:true});
    }
    raw+=decoder.decode();
    const data=JSON.parse(raw);
    if(!data||typeof data!=="object"||Array.isArray(data))throw new ApiError("Enviá un objeto JSON.",400);
    return data;
  }catch(e){if(e instanceof ApiError)throw e;throw new ApiError("JSON incorrecto.",400);}
  finally{reader.releaseLock();}
};
class ApiError extends Error{constructor(message,status){super(message);this.status=status;}}
function haversine(a,b){
 const R=6371,r=Math.PI/180,dl=(b.lat-a.lat)*r,dn=(b.lng-a.lng)*r;
 const x=Math.sin(dl/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dn/2)**2;
 return 2*R*Math.asin(Math.min(1,Math.sqrt(x)));
}
function coords(data,key){
 const x=data?.[key];if(!x||typeof x!=="object")throw new ApiError("Faltan coordenadas de "+key,400);
 // No coercionar null, booleanos ni cadenas a coordenadas GPS.
 const lat=x.lat,lng=x.lng;
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)throw new ApiError("Coordenadas inválidas.",400);
 if(haversine(CENTER,{lat,lng})>30)throw new ApiError("Por ahora, la zona piloto se limita a Ayacucho.",400);
 return {lat,lng};
}
function cors(req,env){
 const origin=req.headers.get("Origin");
 const allowed=env.FRONTEND_ORIGIN;
 return origin&&origin===allowed?{"Access-Control-Allow-Origin":origin,"Vary":"Origin","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Authorization, Content-Type","Access-Control-Max-Age":"600"}:{};
}
function withCors(response,headers){
 const h=new Headers(response.headers);Object.entries(headers).forEach(([k,v])=>h.set(k,v));
 return new Response(response.body,{status:response.status,headers:h});
}
async function rateLimit(env,key,limit,period){
 const now=Date.now(),window=Math.floor(now/period)*period;
 // Escritura atómica: las solicitudes simultáneas no pueden eludir el límite.
 const result=await env.DB.prepare("INSERT INTO rate_limits(key,window_start,hits) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.window_start=excluded.window_start THEN rate_limits.hits+1 ELSE 1 END,window_start=excluded.window_start WHERE rate_limits.window_start<>excluded.window_start OR rate_limits.hits<?").bind(key,window,limit).run();
 if(!result.meta?.changes)throw new ApiError("Demasiados intentos. Probá más tarde.",429);
}
async function authenticate(req,env){
 const header=req.headers.get("Authorization")||"";
 if(!/^Bearer [0-9a-f]{64}$/.test(header))throw new ApiError("Necesitás iniciar sesión.",401);
 const hash=await sha256(header.slice(7));
 const found=await env.DB.prepare("SELECT u.id,u.email,u.driver_status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").bind(hash,Date.now()).first();
 if(!found)throw new ApiError("Sesión inválida o vencida.",401);
 return found;
}
async function revokeSession(req,env){
 const header=req.headers.get("Authorization")||"";
 if(!/^Bearer [0-9a-f]{64}$/.test(header))throw new ApiError("Necesitás iniciar sesión.",401);
 const hash=await sha256(header.slice(7));
 const result=await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(hash).run();
 if(!result.meta?.changes)throw new ApiError("Sesión inválida o vencida.",401);
 return json({ok:true,message:"Sesión revocada."});
}
async function sendEmailCode(env,email,code){
 if(!env.BREVO_API_KEY||!env.MAIL_FROM)throw new ApiError("Correo no configurado en el servidor.",503);
 const request={sender:{name:"BM Viajes",email:env.MAIL_FROM},to:[{email}],subject:"Tu código de acceso a BM Viajes",htmlContent:"<p>Tu código de acceso es:</p><p style=\"font-size:26px;font-weight:bold\">"+code+"</p><p>Caduca en 10 minutos. Si no lo solicitaste, ignorá este mensaje.</p>",textContent:"Tu código de BM Viajes es "+code+". Caduca en 10 minutos."};
 let response;
 try{response=await fetch("https://api.brevo.com/v3/smtp/email",{method:"POST",headers:{"api-key":env.BREVO_API_KEY,"Content-Type":"application/json"},body:JSON.stringify(request)});}
 catch(e){throw new ApiError("Servicio de correo temporalmente no disponible.",503);}
 if(!response.ok)throw new ApiError("No se pudo enviar el código. Revisá la configuración de correo.",503);
}
async function startAuth(req,env){
 const body=await jsonInput(req),email=safeEmail(body?.email);
 if(!email)throw new ApiError("Correo inválido.",400);
 const now=Date.now(),key="otp:"+await sha256(email+"|"+env.AUTH_SECRET);
 await rateLimit(env,key,3,3600000);
 const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,"0");
 const hash=await sha256(email+"|"+code+"|"+env.AUTH_SECRET);
 await env.DB.prepare("INSERT INTO otp_challenges(email,code_hash,expires_at,last_sent_at,attempts) VALUES(?,?,?,?,0) ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,last_sent_at=excluded.last_sent_at,attempts=0").bind(email,hash,now+600000,now).run();
 try{await sendEmailCode(env,email,code);}
 catch(e){await env.DB.prepare("DELETE FROM otp_challenges WHERE email=? AND code_hash=?").bind(email,hash).run();throw e;}
 return json({ok:true,message:"Te enviamos un código si el correo está disponible."});
}
async function verifyAuth(req,env){
 const body=await jsonInput(req),email=safeEmail(body?.email),code=body?.code;
 if(!email||typeof code!=="string"||!/^[0-9]{6}$/.test(code))throw new ApiError("Correo o código inválido.",400);
 // Reservar cada intento de forma atómica ANTES de comprobar el código.
 // Evita que peticiones paralelas eludan el máximo de cinco intentos.
 const row=await env.DB.prepare("SELECT code_hash FROM otp_challenges WHERE email=?").bind(email).first();
 if(!row)throw new ApiError("Código inválido o vencido.",401);
 const reserved=await env.DB.prepare("UPDATE otp_challenges SET attempts=attempts+1 WHERE email=? AND code_hash=? AND expires_at>? AND attempts<5").bind(email,row.code_hash,Date.now()).run();
 if(!reserved.meta?.changes)throw new ApiError("Código inválido o vencido.",401);
 const ok=await sha256(email+"|"+code+"|"+env.AUTH_SECRET)===row.code_hash;
 if(!ok)throw new ApiError("Código inválido o vencido.",401);
 const consumed=await env.DB.prepare("DELETE FROM otp_challenges WHERE email=? AND code_hash=? AND expires_at>? AND attempts<=5").bind(email,row.code_hash,Date.now()).run();
 if(!consumed.meta?.changes)throw new ApiError("Código ya utilizado.",401);
 const now=Date.now(),userId=crypto.randomUUID();
 await env.DB.prepare("INSERT INTO users(id,email,created_at) VALUES(?,?,?) ON CONFLICT(email) DO NOTHING").bind(userId,email,now).run();
 const user=await env.DB.prepare("SELECT id,email,driver_status FROM users WHERE email=?").bind(email).first();
 const token=randomHex(),hash=await sha256(token);
 await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)").bind(hash,user.id,now+14*86400000,now).run();
 return json({ok:true,token,expires_at:now+14*86400000,user:{id:user.id,email:user.email,driver_status:user.driver_status}});
}
async function applyDriver(req,env,user){
 const body=await jsonInput(req);
 if(body?.accept_review!==true)throw new ApiError("Confirmá que la cuenta requiere revisión manual.",400);
 // Consultar el estado actual, no el snapshot de autenticación: una suspensión
 // o aprobación concurrente no debe producir una confirmación falsa de solicitud.
 const changed=await env.DB.prepare("UPDATE users SET driver_status='pending' WHERE id=? AND driver_status IN ('none','rejected','pending') RETURNING driver_status").bind(user.id).first();
 if(!changed){
   const current=await env.DB.prepare("SELECT driver_status FROM users WHERE id=?").bind(user.id).first();
   if(current?.driver_status==="approved")return json({ok:true,status:"approved"});
   if(current?.driver_status==="suspended")throw new ApiError("Cuenta suspendida. Contactá a soporte.",403);
   throw new ApiError("El estado de la cuenta cambió. Volvé a intentar.",409);
 }
 return json({ok:true,status:"pending",message:"Solicitud registrada. Antes de conducir debe verificarse identidad, licencia, vehículo, seguro y habilitación local. No subas documentos por esta API."});
}
function driverOnly(user){if(user.driver_status!=="approved")throw new ApiError("Solo conductores verificados pueden recibir viajes.",403);}
function liveOnly(env){if(env.ENABLE_LIVE_RIDES!=="true")throw new ApiError("El servicio de viajes reales aún está deshabilitado. Usá la demo.",503);}
async function newRide(req,env,user){
 liveOnly(env);
 const input=await jsonInput(req),a=coords(input,"origin"),b=coords(input,"destination"),air=haversine(a,b);
 if(air<.1||air>30)throw new ApiError("Elegí un recorrido válido.",400);
 // La comprobación atómica impide dos solicitudes paralelas y viajar como pasajero mientras se conduce.
 // Un viaje aceptado o en curso sigue activo aunque venza el plazo original de solicitud.
 const now=Date.now(),id=crypto.randomUUID();
 const kind=input.kind??"one_way";
 const night=Number(new Intl.DateTimeFormat("en-GB",{timeZone:"America/Argentina/Buenos_Aires",hour:"2-digit",hourCycle:"h23"}).format(new Date(now)));
 let fare;try{fare=estimateUrbanFare({kind,night:night>=22||night<6});}catch(e){if(e instanceof RangeError)throw new ApiError("Modalidad sin tarifa definida.",400);throw e;}
 const insertRide=env.DB.prepare("INSERT INTO rides(id,rider_id,origin_lat,origin_lng,destination_lat,destination_lng,distance_air_km,status,created_at,updated_at,expires_at) SELECT ?,?,?,?,?,?,?,'requested',?,?,? WHERE NOT EXISTS (SELECT 1 FROM rides WHERE (rider_id=? AND (status IN ('accepted','in_progress') OR (status='requested' AND expires_at>?))) OR (driver_id=? AND status IN ('accepted','in_progress')))").bind(id,user.id,a.lat,a.lng,b.lat,b.lng,Number(air.toFixed(2)),now,now,now+15*60000,user.id,now,user.id);
 const insertFare=env.DB.prepare("INSERT INTO ride_fares(ride_id,kind,tariff_version,base_ars,commission_bps,wait_free_seconds,wait_minute_ars,created_at) SELECT id,?,?,?,?,?,?,? FROM rides WHERE id=?").bind(kind,fare.version,fare.base,TARIFF.commissionPercent*100,kind==="round_trip"?TARIFF.freeWaitSeconds:0,kind==="round_trip"?TARIFF.waitPerMinute:0,now,id);
 const [inserted]=await env.DB.batch([insertRide,insertFare]);
 if(!inserted.meta?.changes)throw new ApiError("Ya tenés un viaje activo. Terminá o cancelá ese pedido.",409);
 return json({ok:true,ride_id:id,status:"requested",distance_air_km:Number(air.toFixed(2)),fare_ars:fare.base,payment_status:"not_implemented",message:"Tarifa base de piloto guardada; sin pago confirmado."},201);
}
// Un pedido vencido no debe aparecer activo mientras espera la limpieza programada.
// No alterar viajes aceptados o en curso: expires_at solo limita la solicitud inicial.
function visibleRide(ride,now=Date.now()){
 return ride.status==="requested"&&ride.expires_at<=now?{...ride,status:"cancelled"}:ride;
}
async function myRides(env,user){
 const result=await env.DB.prepare("SELECT id,status,rider_id,driver_id,origin_lat,origin_lng,destination_lat,destination_lng,created_at,updated_at,expires_at FROM rides WHERE rider_id=? OR driver_id=? ORDER BY created_at DESC LIMIT 30").bind(user.id,user.id).all();
 const now=Date.now();
 return json({ok:true,rides:(result.results||[]).map(ride=>visibleRide(ride,now))});
}
async function openRides(env,user){
 driverOnly(user);liveOnly(env);
 const result=await env.DB.prepare("SELECT id,origin_lat,origin_lng,destination_lat,destination_lng,distance_air_km,created_at FROM rides WHERE status='requested' AND expires_at>? AND rider_id<>? AND EXISTS (SELECT 1 FROM users WHERE id=? AND driver_status='approved') ORDER BY created_at LIMIT 20").bind(Date.now(),user.id,user.id).all();
 const rides=(result.results||[]).map(r=>({id:r.id,origin:{lat:Number(r.origin_lat.toFixed(3)),lng:Number(r.origin_lng.toFixed(3))},destination_area:{lat:Number(r.destination_lat.toFixed(3)),lng:Number(r.destination_lng.toFixed(3))},distance_air_km:r.distance_air_km,created_at:r.created_at}));
 return json({ok:true,rides});
}
async function rideAccess(env,user,id){
 const ride=await env.DB.prepare("SELECT * FROM rides WHERE id=?").bind(id).first();
 if(!ride)throw new ApiError("Viaje inexistente.",404);
 if(ride.rider_id!==user.id && ride.driver_id!==user.id)throw new ApiError("No tenés acceso a este viaje.",403);
 return ride;
}
async function acceptRide(env,user,id){
 driverOnly(user);liveOnly(env);
 const now=Date.now();
 const current=await env.DB.prepare("SELECT id FROM rides WHERE driver_id=? AND status IN ('accepted','in_progress') LIMIT 1").bind(user.id).first();
 if(current)throw new ApiError("Ya tenés un viaje en curso.",409);
 // Revalidar aprobación en la escritura: una suspensión concurrente impide aceptar.
 const result=await env.DB.prepare("UPDATE rides SET driver_id=?,status='accepted',updated_at=? WHERE id=? AND status='requested' AND expires_at>? AND driver_id IS NULL AND rider_id<>? AND NOT EXISTS (SELECT 1 FROM rides AS active WHERE (active.driver_id=? AND active.status IN ('accepted','in_progress')) OR (active.rider_id=? AND (active.status IN ('accepted','in_progress') OR (active.status='requested' AND active.expires_at>?)))) AND EXISTS (SELECT 1 FROM users WHERE id=? AND driver_status='approved')").bind(user.id,now,id,now,user.id,user.id,user.id,now,user.id).run();
 if(!result.meta?.changes)throw new ApiError("El pedido ya fue aceptado, venció o tenés otro viaje activo.",409);
 return json({ok:true,status:"accepted"});
}
// Un único intervalo de espera por ida y vuelta, controlado por el reloj del servidor.
async function rideWait(req,env,user,id){
 liveOnly(env);
 const data=await jsonInput(req),action=data.action;
 if(!["start","stop"].includes(action)||Object.keys(data).some(k=>k!=="action"))throw new ApiError("Acción de espera inválida.",400);
 const ride=await rideAccess(env,user,id);
 if(ride.driver_id!==user.id)throw new ApiError("Solo el conductor asignado puede controlar la espera.",403);
 const now=Date.now();
 const change=action==="start"
  ?await env.DB.prepare("INSERT INTO ride_waits(ride_id,started_at) SELECT r.id,? FROM rides r JOIN ride_fares f ON f.ride_id=r.id JOIN users u ON u.id=r.driver_id WHERE r.id=? AND r.driver_id=? AND r.status='in_progress' AND f.kind='round_trip' AND u.driver_status='approved' ON CONFLICT(ride_id) DO NOTHING").bind(now,id,user.id).run()
  :await env.DB.prepare("UPDATE ride_waits SET ended_at=MAX(started_at,?) WHERE ride_id=? AND ended_at IS NULL AND EXISTS (SELECT 1 FROM rides WHERE id=? AND driver_id=? AND status='in_progress')").bind(now,id,id,user.id).run();
 if(!change.meta?.changes)throw new ApiError("La espera no se puede modificar en este estado.",409);
 return json({ok:true,wait:await env.DB.prepare("SELECT started_at,ended_at FROM ride_waits WHERE ride_id=?").bind(id).first()});
}
async function rideFinancials(env,id){
 return await env.DB.prepare("SELECT f.kind,f.tariff_version,f.base_ars,f.commission_bps,f.wait_free_seconds,f.wait_minute_ars,w.started_at,w.ended_at,t.wait_seconds,t.waiting_ars,t.total_ars,t.commission_ars,t.finalized_at FROM ride_fares f LEFT JOIN ride_waits w ON w.ride_id=f.ride_id LEFT JOIN ride_totals t ON t.ride_id=f.ride_id WHERE f.ride_id=?").bind(id).first();
}
async function cashStatus(env,id){
 const row=await env.DB.prepare("SELECT COUNT(*) AS confirmations FROM cash_confirmations WHERE ride_id=?").bind(id).first();
 return {method:"cash",status:row.confirmations===2?"confirmed":row.confirmations===1?"awaiting_counterparty":"unconfirmed",confirmations:row.confirmations};
}
async function confirmCash(req,env,user,id){
 const data=await jsonInput(req);
 if(data.confirm!==true||Object.keys(data).some(k=>k!=="confirm"))throw new ApiError("Confirmá el pago en efectivo.",400);
 const ride=await rideAccess(env,user,id);
 if(ride.status!=="completed")throw new ApiError("El viaje todavía no está finalizado.",409);
 const role=ride.rider_id===user.id?"rider":"driver";
 const result=await env.DB.prepare("INSERT INTO cash_confirmations(ride_id,role,user_id,confirmed_at) SELECT r.id,?,?,? FROM rides r JOIN ride_totals t ON t.ride_id=r.id WHERE r.id=? AND r.status='completed' AND ((?='rider' AND r.rider_id=?) OR (?='driver' AND r.driver_id=?)) ON CONFLICT(ride_id,role) DO NOTHING").bind(role,user.id,Date.now(),id,role,user.id,role,user.id).run();
 if(!result.meta?.changes){
   const existing=await env.DB.prepare("SELECT user_id FROM cash_confirmations WHERE ride_id=? AND role=?").bind(id,role).first();
   if(existing?.user_id!==user.id)throw new ApiError("No hay importe final disponible.",409);
 }
 return json({ok:true,payment:await cashStatus(env,id)});
}
async function driverLedger(env,user){
 const balance=await env.DB.prepare("SELECT COALESCE(SUM(amount_ars),0) AS commission_due_ars FROM driver_ledger WHERE driver_id=?").bind(user.id).first();
 const entries=await env.DB.prepare("SELECT id,ride_id,kind,amount_ars,created_at FROM driver_ledger WHERE driver_id=? ORDER BY created_at DESC,id DESC LIMIT 100").bind(user.id).all();
 return json({ok:true,currency:"ARS",commission_due_ars:balance.commission_due_ars,entries:entries.results||[],settlements_enabled:false});
}
async function rideStatus(req,env,user,id){
 liveOnly(env);
 const data=await jsonInput(req),next=data?.status,ride=await rideAccess(env,user,id),now=Date.now();
 let old;
 if(next==="cancelled" && ride.rider_id===user.id && ["requested","accepted"].includes(ride.status))old=ride.status;
 else if(next==="cancelled" && ride.driver_id===user.id && ride.status==="accepted")old="accepted";
 else if(next==="in_progress" && ride.driver_id===user.id && ride.status==="accepted")old="accepted";
 else if(next==="completed" && ride.driver_id===user.id && ride.status==="in_progress")old="in_progress";
 else throw new ApiError("Transición no autorizada para este viaje.",409);
 // Un conductor suspendido no puede iniciar un traslado; sí puede cancelar o cerrar uno en curso por seguridad.
 const update=env.DB.prepare("UPDATE rides SET status=?,updated_at=? WHERE id=? AND status=? AND (?<>'in_progress' OR EXISTS (SELECT 1 FROM users WHERE id=rides.driver_id AND driver_status='approved'))").bind(next,now,id,old,next);
 // D1 batch es transaccional: si falla el borrado GPS, también se revierte el cierre.
 // La condición evita borrar GPS de un viaje que cambió concurrentemente a un estado activo.
 const terminal=next==="completed"||next==="cancelled";
 const statements=[update];
 if(terminal){
   statements.push(env.DB.prepare("DELETE FROM ride_positions WHERE ride_id=? AND EXISTS (SELECT 1 FROM rides WHERE id=? AND status IN ('completed','cancelled'))").bind(id,id));
 }
 if(next==="completed"){
   // Close an open wait at completion. Limit the pilot's billable wait to 24h.
   statements.push(env.DB.prepare("UPDATE ride_waits SET ended_at=MAX(started_at,?) WHERE ride_id=? AND ended_at IS NULL AND EXISTS (SELECT 1 FROM rides WHERE id=? AND status='completed' AND updated_at=?)").bind(now,id,id,now));
   statements.push(env.DB.prepare("INSERT INTO ride_totals(ride_id,wait_seconds,waiting_ars,total_ars,commission_ars,finalized_at) SELECT ride_id,seconds,waiting,base_ars+waiting,CAST(((base_ars+waiting)*commission_bps+5000)/10000 AS INTEGER),? FROM (SELECT *,CAST((MAX(0,seconds-wait_free_seconds)+59)/60 AS INTEGER)*wait_minute_ars AS waiting FROM (SELECT f.*,MIN(86400,MAX(0,CAST((COALESCE(w.ended_at,w.started_at,0)-COALESCE(w.started_at,0)+999)/1000 AS INTEGER))) AS seconds FROM ride_fares f JOIN rides r ON r.id=f.ride_id LEFT JOIN ride_waits w ON w.ride_id=f.ride_id WHERE r.id=? AND r.status='completed' AND r.updated_at=?)) WHERE 1 ON CONFLICT(ride_id) DO NOTHING").bind(now,id,now));
 }
 const result=terminal?(await env.DB.batch(statements))[0]:await update.run();
 if(!result.meta?.changes)throw new ApiError("El viaje cambió de estado. Actualizá.",409);
 return json({ok:true,status:next,...(next==="completed"?{financials:await rideFinancials(env,id)}:{})});
}
async function driverPosition(req,env,user,id){
 liveOnly(env);driverOnly(user);
 const ride=await rideAccess(env,user,id);
 if(ride.driver_id!==user.id||!["accepted","in_progress"].includes(ride.status))throw new ApiError("No hay viaje activo asignado.",403);
 const body=await jsonInput(req),p=coords({position:body?.position},"position"),accuracy=body?.accuracy_m;
 if(!Number.isFinite(accuracy)||accuracy<0||accuracy>300)throw new ApiError("GPS insuficientemente preciso.",400);
 const now=Date.now();
 // Revalidar asignación y aprobación en la escritura: cancelación o suspensión concurrente bloquean el GPS.
 // Una escritura atrasada no puede reemplazar una posición más reciente.
 const saved=await env.DB.prepare("INSERT INTO ride_positions(ride_id,driver_id,lat,lng,accuracy_m,updated_at) SELECT id,driver_id,?,?,?,? FROM rides WHERE id=? AND driver_id=? AND status IN ('accepted','in_progress') AND EXISTS (SELECT 1 FROM users WHERE id=rides.driver_id AND driver_status='approved') ON CONFLICT(ride_id) DO UPDATE SET lat=excluded.lat,lng=excluded.lng,accuracy_m=excluded.accuracy_m,updated_at=excluded.updated_at WHERE excluded.updated_at>=ride_positions.updated_at AND EXISTS (SELECT 1 FROM rides JOIN users ON users.id=rides.driver_id WHERE rides.id=excluded.ride_id AND rides.driver_id=excluded.driver_id AND rides.status IN ('accepted','in_progress') AND users.driver_status='approved')").bind(p.lat,p.lng,accuracy,now,id,user.id).run();
 if(!saved.meta?.changes)throw new ApiError("El viaje cambió o la ubicación quedó desactualizada. No se guardó la ubicación.",409);
 return json({ok:true,updated_at:now});
}
async function getDriverPosition(env,user,id){
 // The emergency stop also disables disclosure of previously shared GPS positions.
 liveOnly(env);
 const ride=await rideAccess(env,user,id);
 if(!["accepted","in_progress"].includes(ride.status))return json({ok:true,position:null});
 // Revalidar viaje, asignación y aprobación en la misma lectura; no revelar GPS tras suspensión o cancelación.
 const p=await env.DB.prepare("SELECT p.lat,p.lng,p.accuracy_m,p.updated_at FROM ride_positions p JOIN rides r ON r.id=p.ride_id AND r.driver_id=p.driver_id JOIN users u ON u.id=r.driver_id WHERE p.ride_id=? AND r.status IN ('accepted','in_progress') AND u.driver_status='approved' AND p.updated_at>?").bind(id,Date.now()-120000).first();
 return json({ok:true,position:p||null});
}
async function main(req,env){
 const url=new URL(req.url),path=url.pathname.replace(/\/$/,""),method=req.method;
 // Cotización pública de simulación: no crea viajes, no consulta datos personales ni habilita pagos.
 if(method==="GET"&&path==="/api/fare/estimate"){
   const q=url.searchParams, allowed=new Set(["kind","night","waitSeconds"]);
   for(const key of q.keys())if(!allowed.has(key)||q.getAll(key).length!==1)throw new ApiError("Parámetros de tarifa inválidos.",400);
   const kind=q.get("kind"),night=q.get("night")??"false",wait=q.get("waitSeconds")??"0";
   if(!["true","false"].includes(night)||!/^\d{1,5}$/.test(wait))throw new ApiError("Parámetros de tarifa inválidos.",400);
   try{return json({ok:true,estimate:estimateUrbanFare({kind,night:night==="true",waitSeconds:Number(wait)})});}
   catch(e){if(e instanceof RangeError)throw new ApiError("Modalidad o espera no admitida.",400);throw e;}
 }
 if(!env?.DB)throw new ApiError("Base de datos no configurada.",503);
 if(method==="GET"&&path==="/api/health"){
   // Comprobar conectividad y presencia de tablas sin leer datos personales.
   try{
     const ready=await env.DB.prepare("SELECT COUNT(*) AS ready_tables FROM sqlite_master WHERE type='table' AND name IN ('users','otp_challenges','sessions','rate_limits','rides','ride_positions')").first();
     if(ready?.ready_tables!==6)throw new Error("Schema incomplete");
   }catch(e){throw new ApiError("Base de datos no disponible o esquema incompleto.",503);}
   return json({ok:true,service:"BM Viajes",mode:env.ENABLE_LIVE_RIDES==="true"?"pilot":"demo",database:"ready"});
 }
 if(method==="GET"&&path==="/api/config")return json({ok:true,live_rides_enabled:env.ENABLE_LIVE_RIDES==="true",payments_enabled:false,area:"Ayacucho",fare_calculation:"pending_municipal_tariffs"});
 // La revocación debe seguir disponible incluso con el límite general de POST agotado.
 // La eliminación se limita al hash del token y no crea sesiones ni viajes.
 if(method==="POST"&&path==="/api/auth/logout")return revokeSession(req,env);
 const ip=req.headers.get("CF-Connecting-IP")||"unknown";
 if(method==="POST"){
   if(!env.AUTH_SECRET||env.AUTH_SECRET.length<32)throw new ApiError("Autenticación segura pendiente de configuración.",503);
   // GPS tiene un presupuesto separado: no agotar autenticación ni acciones del viaje.
   const gpsPost=/^\/api\/rides\/[0-9a-f-]{36}\/location$/.test(path);
   await rateLimit(env,(gpsPost?"gps-ip:":"ip:")+await sha256(ip+"|"+env.AUTH_SECRET),gpsPost?240:60,gpsPost?60000:3600000);
 }
 if(method==="POST"&&path==="/api/auth/start")return startAuth(req,env);
 if(method==="POST"&&path==="/api/auth/verify")return verifyAuth(req,env);
 const user=await authenticate(req,env);
 if(method==="GET"&&path==="/api/me")return json({ok:true,user});
 if(method==="POST"&&path==="/api/driver/apply")return applyDriver(req,env,user);
 if(method==="GET"&&path==="/api/driver/ledger")return driverLedger(env,user);
 if(method==="GET"&&path==="/api/rides/mine")return myRides(env,user);
 if(method==="GET"&&path==="/api/rides/open")return openRides(env,user);
 if(method==="POST"&&path==="/api/rides")return newRide(req,env,user);
 const match=path.match(/^\/api\/rides\/([0-9a-f-]{36})(?:\/(accept|status|location|wait|cash))?$/);
 if(match){
   const id=match[1],sub=match[2]||"";
   if(method==="GET"&&sub===""){const ride=visibleRide(await rideAccess(env,user,id));return json({ok:true,ride,financials:await rideFinancials(env,id)});}
   if(method==="POST"&&sub==="cash")return confirmCash(req,env,user,id);
   if(method==="GET"&&sub==="cash"){await rideAccess(env,user,id);return json({ok:true,payment:await cashStatus(env,id)});}
   if(method==="POST"&&sub==="wait")return rideWait(req,env,user,id);
   if(method==="POST"&&sub==="accept")return acceptRide(env,user,id);
   if(method==="POST"&&sub==="status")return rideStatus(req,env,user,id);
   if(method==="POST"&&sub==="location"){
     liveOnly(env);driverOnly(user);
     // Hasta una actualización cada cinco segundos en promedio, por conductor.
     await rateLimit(env,"gps-user:"+user.id,12,60000);
     return driverPosition(req,env,user,id);
   }
   if(method==="GET"&&sub==="location")return getDriverPosition(env,user,id);
 }
 return error("Ruta no encontrada.",404);
}
export default {
 async fetch(request,env){
   const c=cors(request,env);
   if(request.method==="OPTIONS")return withCors(Object.keys(c).length?new Response(null,{status:204}):error("Origen no autorizado.",403),c);
   const origin=request.headers.get("Origin");
   if(origin&&origin!==env.FRONTEND_ORIGIN)return error("Origen no autorizado.",403);
   try{return withCors(await main(request,env),c);}
   catch(e){
      const status=e instanceof ApiError?e.status:500;
      return withCors(error(e instanceof ApiError?e.message:"Error interno. Contactá a soporte.",status),c);
   }
 },
 async scheduled(event,env,ctx){
   const now=Date.now();
   ctx.waitUntil(Promise.all([
    env.DB.prepare("DELETE FROM otp_challenges WHERE expires_at<?").bind(now).run(),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at<?").bind(now).run(),
    env.DB.prepare("DELETE FROM ride_positions WHERE updated_at<?").bind(now-180000).run(),
    env.DB.prepare("DELETE FROM rate_limits WHERE window_start<?").bind(now-86400000).run(),
    env.DB.prepare("UPDATE rides SET status='cancelled',updated_at=? WHERE status='requested' AND expires_at<?").bind(now,now).run()
   ]));
 }
};
