/* BM Viajes: inscripción exclusiva de conductores. Reutiliza autenticación, perfiles y documentación del backend existente. */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const raw=String(window.BM_VIAJES_API_URL||"").trim().replace(/\/$/,"");
let base="",token=sessionStorage.getItem("bm-viajes-pilot-token")||"",user=null,profileExists=false,documents=[],requestedEmail="",emailGeneration=0,sessionGeneration=0,ready=false;
const kinds=Object.freeze({identity:"Identidad",license:"Licencia de conducir",permit:"Habilitación",insurance:"Seguro para transporte",vtv:"VTV"});
try{const u=new URL(raw);if(u.protocol==="https:"&&!u.username&&!u.password&&!u.search&&!u.hash)base=u.origin+u.pathname.replace(/\/$/,"");}catch{}
function notice(message,error=false,where="feedback"){
 const el=$(where);el.hidden=false;el.textContent=message;
 el.className=where==="server-status"?"notice"+(error?" error":" success"):"notice"+(error?" error":" success");
}
function fail(message){notice(message,true);}
async function api(path,method="GET",data,auth=!!token){
 if(!base)throw Error("El servidor de BM Viajes no está configurado.");
 const ctrl=new AbortController();const timeout=setTimeout(()=>ctrl.abort(),15000);
 try{
  const headers={"Accept":"application/json"};
  if(data!==undefined)headers["Content-Type"]="application/json";
  if(auth&&token)headers.Authorization="Bearer "+token;
  const r=await fetch(base+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data),cache:"no-store",mode:"cors",signal:ctrl.signal});
  const b=await r.json().catch(()=>({}));
  if(!r.ok||!b.ok)throw Error(b.error||"Servidor no disponible ("+r.status+").");
  return b;
 }catch(e){if(e.name==="AbortError")throw Error("La conexión tardó demasiado. Intentá otra vez.");throw e;}finally{clearTimeout(timeout);}
}
async function withButton(button,fn){
 if(button.disabled)return;
 button.disabled=true;
 try{await fn();}catch(e){fail(e.message||"No se pudo completar la operación.");}
 finally{button.disabled=false;renderReview();}
}
function clearSession(){
 token="";sessionStorage.removeItem("bm-viajes-pilot-token");user=null;profileExists=false;documents=[];
 sessionGeneration++;$("account").hidden=true;$("login").hidden=false;$("code-form").hidden=true;$("access-code").value="";$("email").value="";
 requestedEmail="";emailGeneration++;$("send-code").disabled=!ready;
}
function updateUser(u){
 user=u;$("login").hidden=true;$("account").hidden=false;$("account-email").textContent=u.email;
 const names={none:"Todavía no solicitaste revisión",pending:"Inscripción pendiente de revisión",approved:"Conductor aprobado para el piloto",rejected:"Inscripción rechazada: revisá los requisitos",suspended:"Cuenta suspendida: contactá a soporte"};
 $("approval-status").textContent=names[u.driver_status]||"Estado: "+String(u.driver_status);
 $("review-hint").textContent=u.driver_status==="approved"?"La cuenta ya fue aprobada. Cualquier cambio de datos o documentos requiere nueva revisión.":"Guardá los datos y cargá los cinco documentos para solicitar revisión.";
 renderReview();
}
function renderDocs(){
 const holder=$("document-status");holder.replaceChildren();
 for(const [kind,label] of Object.entries(kinds)){
  const doc=documents.find(d=>d.kind===kind),row=document.createElement("div"),title=document.createElement("strong"),detail=document.createElement("span");
  row.className="doc-row";title.textContent=label;
  const expired=doc&&doc.expires_at<=Date.now();
  detail.textContent=!doc?"Falta cargar":expired?"Vencido":doc.review_status==="approved"?"Aprobado":doc.review_status==="rejected"?"Rechazado: volver a enviar":"Recibido, pendiente de revisión";
  row.append(title,detail);holder.append(row);
 }
}
function renderReview(){
 const valid=profileExists&&Object.keys(kinds).every(kind=>documents.some(d=>d.kind===kind&&d.expires_at>Date.now()&&d.review_status!=="rejected"));
 const blocked=!ready||!user||["approved","suspended"].includes(user?.driver_status);
 $("request-review").disabled=blocked||!valid||!$("accept-review").checked;
 $("upload-document").disabled=!ready||!user||!profileExists||user?.driver_status==="suspended";
 $("review-hint").textContent=user?.driver_status==="approved"?"Cuenta aprobada. Si modificás documentación habrá una nueva revisión.":!profileExists?"Primero guardá los datos del conductor.":!valid?"Completá los cinco documentos vigentes antes de solicitar revisión.":"Documentación recibida. Podés solicitar revisión; un administrador debe aprobarte.";
}
async function loadProfile(epoch=sessionGeneration){
 const r=await api("/api/driver/profile");if(epoch!==sessionGeneration||!user)return;
 const p=r.profile;
 profileExists=!!p;
 for(const key of ["display_name","vehicle","plate"])$("profile-form").elements[key].value=p?.[key]||"";
 documents=Array.isArray(r.documents)?r.documents:[];
 renderDocs();renderReview();
}
async function loggedIn(data){
 const epoch=sessionGeneration;updateUser(data.user);
 await loadProfile(epoch);
}
$("email").addEventListener("input",()=>{
 emailGeneration++;requestedEmail="";$("code-form").hidden=true;$("access-code").value="";
});
$("email-form").addEventListener("submit",async e=>{
 e.preventDefault();const btn=$("send-code"),email=$("email").value.trim().toLowerCase();
 if(!ready||!email||btn.disabled)return;
 const epoch=emailGeneration;
 btn.disabled=true;$("code-form").hidden=true;requestedEmail="";
 try{
  await api("/api/auth/start","POST",{email},false);
  if(epoch!==emailGeneration)return;
  requestedEmail=email;$("code-form").hidden=false;notice("Si el correo funciona, recibirás un código de 6 dígitos. Revisá también la carpeta de spam.");
 }catch(err){if(epoch===emailGeneration)fail(err.message);}
 finally{btn.disabled=!ready;}
});
$("code-form").addEventListener("submit",async e=>{
 e.preventDefault();const button=$("verify-code"),email=$("email").value.trim().toLowerCase(),code=$("access-code").value.trim();
 if(button.disabled)return;
 if(!requestedEmail||email!==requestedEmail||!/^[0-9]{6}$/.test(code)){fail("Solicitá un código válido para este mismo correo.");return;}
 const epoch=emailGeneration;button.disabled=true;
 try{
  const r=await api("/api/auth/verify","POST",{email,code},false);
  if(epoch!==emailGeneration||email!==$("email").value.trim().toLowerCase())return;
  token=r.token;sessionStorage.setItem("bm-viajes-pilot-token",token);sessionGeneration++;
  $("access-code").value="";await loggedIn(r);notice("Correo verificado. Completá tus datos para solicitar revisión.");
 }catch(err){if(epoch===emailGeneration)fail(err.message);}
 finally{button.disabled=false;}
});
$("profile-form").addEventListener("submit",async e=>{
 e.preventDefault();const button=$("save-profile");
 await withButton(button,async()=>{
  const form=$("profile-form"),fields=Object.fromEntries(new FormData(form));
  fields.plate=fields.plate.trim().toUpperCase();
  if(!/^[A-Z0-9 -]{6,12}$/.test(fields.plate))throw Error("Ingresá una patente válida (6 a 12 caracteres).");
  await api("/api/driver/profile","POST",fields);
  const r=await api("/api/me");updateUser(r.user);
  await loadProfile();notice("Datos guardados. Podés presentar la documentación.");
 });
});
async function compressDocument(file){
 if(!file||!["image/jpeg","image/png"].includes(file.type)||file.size>10*1024*1024||file.size===0)throw Error("Elegí una foto JPG o PNG de hasta 10 MB.");
 const image=await createImageBitmap(file);
 try{
  const canvas=document.createElement("canvas"),scale=Math.min(1,1200/Math.max(image.width,image.height));
  canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  const ctx=canvas.getContext("2d");if(!ctx)throw Error("No se pudo preparar la imagen en este teléfono.");
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  for(let q=.85;q>=.25;q-=.1){
   const encoded=canvas.toDataURL("image/jpeg",q).split(",")[1];
   if(encoded.length<=120000)return encoded;
  }
  throw Error("La foto ocupa demasiado. Recortá el documento o acercá la cámara y reintentá.");
 }finally{image.close();}
}
$("document-form").addEventListener("submit",async e=>{
 e.preventDefault();const btn=$("upload-document");
 await withButton(btn,async()=>{
  if(!profileExists)throw Error("Primero guardá los datos del conductor.");
  const f=$("doc-file").files[0],kind=$("doc-kind").value,date=$("doc-expiry").value,expires=Date.parse(date+"T23:59:59-03:00");
  if(!(kind in kinds)||!Number.isSafeInteger(expires)||expires<=Date.now())throw Error("Elegí un documento y una fecha de vencimiento futura.");
  const data=await compressDocument(f);
  await api("/api/driver/documents","POST",{kind,expires_at:expires,mime:"image/jpeg",data});
  $("document-form").reset();await loadProfile();notice("Documento recibido y cifrado para revisión. No habilita a conducir.");
 });
});
$("accept-review").addEventListener("change",renderReview);
$("request-review").addEventListener("click",async()=>{
 await withButton($("request-review"),async()=>{
  if(!$("accept-review").checked)throw Error("Confirmá las condiciones antes de enviar la solicitud.");
  const r=await api("/api/driver/apply","POST",{accept_review:true});
  const me=await api("/api/me");updateUser(me.user);await loadProfile();
  notice(r.status==="approved"?"El conductor ya figura aprobado.":"Solicitud enviada. La aprobación requiere revisión manual.");
 });
});
$("logout").addEventListener("click",async()=>{
 const current=token;
 clearSession();notice("Sesión cerrada en este dispositivo.");
 try{
  if(current){token=current;await api("/api/auth/logout","POST");}
 }catch{notice("Sesión local cerrada, pero no se pudo confirmar la revocación en el servidor.",true);}
 finally{token="";sessionStorage.removeItem("bm-viajes-pilot-token");}
});
async function boot(){
 if(!base){notice("El servidor de registro todavía no está configurado. No ingreses datos hasta que esté disponible.",true,"server-status");return;}
 try{
  const health=await api("/api/health","GET",undefined,false);
  if(health.database!=="ready"||health.email_configured!==true)throw Error("Base de datos o correo de acceso pendientes de configuración.");
  ready=true;notice("Servidor de registro disponible. Las inscripciones requieren revisión manual.",false,"server-status");
  $("send-code").disabled=false;
  if(token){
   try{const me=await api("/api/me");await loggedIn(me);}
   catch{clearSession();notice("La sesión anterior venció. Ingresá nuevamente con tu correo.",true);}
  }
 }catch(e){ready=false;$("send-code").disabled=true;notice("Registro temporalmente no disponible: "+e.message+" No cargues documentos.",true,"server-status");}
}
boot();
})();
