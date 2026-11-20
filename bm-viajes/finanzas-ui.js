/* BM Viajes: consola de finanzas privada. Datos siempre desde backend autenticado. */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const API=String(window.BM_VIAJES_API_URL||"").trim().replace(/\/$/,"");
const money=x=>new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(Number(x)||0);
const date=x=>x?new Date(x).toLocaleString("es-AR"):"—";
let token=sessionStorage.getItem("bm-viajes-pilot-token")||"",verifiedEmail="",emailEpoch=0,sessionEpoch=0,offset=0,filter="all",hasMore=false,selectedDriver=null,detailOffset=0,detailHasMore=false,ready=false;
function message(s,error=false){const n=$("message");n.textContent=s;n.className="notice"+(error?" error":" success");}
function clearSession(){sessionEpoch++;token="";sessionStorage.removeItem("bm-viajes-pilot-token");$("dashboard").hidden=true;$("detail").hidden=true;$("auth-panel").hidden=false;$("code-form").hidden=true;$("code").value="";verifiedEmail="";}
async function api(route,method="GET",body,secured=true){
 if(!API||!API.startsWith("https://"))throw Error("Servidor API no configurado correctamente.");
 const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),15000);
 try{
  const headers={"Accept":"application/json"};
  if(secured&&token)headers.Authorization="Bearer "+token;
  if(body!==undefined)headers["Content-Type"]="application/json";
  const res=await fetch(API+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:"no-store",mode:"cors",signal:abort.signal});
  const result=await res.json().catch(()=>({}));
  if(!res.ok||!result.ok)throw Error(result.error||"Servidor no disponible ("+res.status+").");
  return result;
 }catch(e){if(e.name==="AbortError")throw Error("La consulta tardó demasiado.");throw e;}finally{clearTimeout(timeout);}
}
async function action(button,fn){
 if(button.disabled)return;button.disabled=true;
 try{await fn();}catch(e){message(e.message,true);}finally{button.disabled=false;}
}
function cell(row,text){
 const td=document.createElement("td");td.textContent=String(text??"—");row.append(td);return td;
}
function value(id,content){$(id).textContent=content;}
function item(container,left,right){
 const row=document.createElement("div"),strong=document.createElement("div"),small=document.createElement("small");
 row.className="item";strong.textContent=left;small.textContent=right;row.append(strong,small);$(container).append(row);
}
async function ensureAdmin(){
 const epoch=sessionEpoch;
 await api("/api/me");
 const capabilities=await api("/api/capabilities");
 if(epoch!==sessionEpoch)return false;
 if(!capabilities.admin)throw Error("Esta cuenta no tiene permisos de administrador. Solicitá que el propietario habilite el acceso desde el servidor.");
 $("auth-panel").hidden=true;$("dashboard").hidden=false;
 return true;
}
async function loadList(){
 const epoch=sessionEpoch;
 const data=await api("/api/admin/finance?filter="+encodeURIComponent(filter)+"&offset="+offset);
 if(epoch!==sessionEpoch)return;
 hasMore=data.has_more;
 const t=data.totals,p=data.policy;
 value("total-drivers",new Intl.NumberFormat("es-AR").format(t.driver_count));
 value("total-outstanding",money(t.commission_due_ars));
 value("total-overdue",money(t.overdue_ars));
 value("total-received",money(t.paid_ars));
 value("policy",p.auto_block_enabled?
  "Regla automática activa: mora desde "+p.grace_days+" días; bloquea únicamente nuevos viajes. Saldo de efectivo confirmado.":
  "Regla automática todavía desactivada: mora prevista desde "+p.grace_days+" días. Solo efectivo confirmado.");
 const body=$("drivers");body.replaceChildren();
 for(const d of data.drivers){
  const row=document.createElement("tr");
  cell(row,d.display_name||d.email);
  cell(row,(d.driver_status||"—")+(d.manually_blocked?" · Bloqueo manual":d.auto_block_active?" · Bloqueo automático":d.would_block_new_rides?" · Vencería política":""));
  cell(row,money(d.charged_ars));cell(row,money(d.paid_ars));
  const due=cell(row,money(d.commission_due_ars));due.className="debt";
  const over=cell(row,money(d.overdue_ars));if(d.overdue_ars>0)over.className="flags";
  const actionCell=document.createElement("td"),btn=document.createElement("button");btn.textContent="Ver cuenta";
  btn.type="button";btn.onclick=()=>{selectedDriver=d.driver_id;detailOffset=0;loadDetail().catch(e=>message(e.message,true));};actionCell.append(btn);row.append(actionCell);body.append(row);
 }
 if(!data.drivers.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=7;td.textContent="No hay conductores en este filtro.";tr.append(td);body.append(tr);}
 value("page","Página "+(Math.floor(offset/50)+1));
 $("prev").disabled=offset===0;$("next").disabled=!hasMore;
 message("Cuentas actualizadas. Los registros financieros son de solo lectura.");
}
async function loadDetail(){
 if(!selectedDriver)return;
 const epoch=sessionEpoch,id=selectedDriver;
 const result=await api("/api/admin/finance/"+encodeURIComponent(id)+"?offset="+detailOffset);
 if(epoch!==sessionEpoch||id!==selectedDriver)return;
 const d=result.driver,b=result.balances;
 $("detail").hidden=false;
 value("detail-title",d.display_name||"Estado de cuenta");
 value("detail-email",d.email+" · "+(d.vehicle||"Sin vehículo")+" · "+(d.plate||"Sin patente")+" · "+d.driver_status);
 value("detail-balance",money(b.commission_due_ars));value("detail-overdue",money(b.overdue_ars));
 value("detail-charges",money(b.charged_ars));value("detail-paid",money(b.paid_ars));
 value("detail-status",b.auto_block_active?"Bloqueo automático activo para nuevas solicitudes de viaje.":b.would_block_new_rides?"El conductor tiene deuda vencida, pero el bloqueo automático no está activado durante las pruebas.":"Sin deuda vencida que active la regla de bloqueo.");
 const tbody=$("history");tbody.replaceChildren();
 for(const r of result.rides){
  const tr=document.createElement("tr");
  cell(tr,date(r.created_at));cell(tr,r.id.slice(0,8));cell(tr,r.status);
  const pay=String(r.payment_method||"—")+(r.payment_method==="cash"?" · "+r.cash_confirmations+"/2 confirmaciones":"");
  cell(tr,pay);cell(tr,r.total_ars===null?"—":money(r.total_ars));
  cell(tr,r.commission_posted?money(r.commission_ars):"Pendiente de acreditar");
  tbody.append(tr);
 }
 if(!result.rides.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=6;td.textContent="No se encontraron viajes en esta página.";tr.append(td);tbody.append(tr);}
 detailHasMore=result.has_more;
 value("history-page","Página "+(Math.floor(detailOffset/50)+1));
 $("history-prev").disabled=detailOffset===0;$("history-next").disabled=!detailHasMore;
 $("charges").replaceChildren();$("settlements").replaceChildren();
 for(const c of result.charges)item("charges",money(c.amount_ars)+" · viaje "+c.ride_id.slice(0,8),"Comisión confirmada "+date(c.created_at));
 for(const c of result.settlements)item("settlements",money(c.amount_ars)+" · referencia "+c.provider_reference,"Acreditado "+date(c.verified_at));
 if(!result.charges.length)item("charges","Sin comisiones acreditadas","Solo los viajes en efectivo confirmados generan deuda.");
 if(!result.settlements.length)item("settlements","Sin pagos verificados","No se consideran pagos las declaraciones sin comprobación.");
 $("detail").scrollIntoView({behavior:"smooth",block:"start"});
}
$("email").addEventListener("input",()=>{emailEpoch++;verifiedEmail="";$("code-form").hidden=true;$("code").value="";});
$("email-form").addEventListener("submit",async e=>{
 e.preventDefault();const button=$("send-code"),email=$("email").value.trim().toLowerCase(),generation=emailEpoch;
 await action(button,async()=>{
  if(!ready)throw Error("El envío de códigos todavía no está disponible.");
  await api("/api/auth/start","POST",{email},false);
  if(generation!==emailEpoch)return;
  verifiedEmail=email;$("code-form").hidden=false;
  message("Código solicitado. Revisá tu correo y el spam.");
 });
});
$("code-form").addEventListener("submit",async e=>{
 e.preventDefault();const button=$("verify"),code=$("code").value.trim(),email=$("email").value.trim().toLowerCase(),generation=emailEpoch;
 await action(button,async()=>{
  if(email!==verifiedEmail||!/^[0-9]{6}$/.test(code))throw Error("Ingresá un código de 6 dígitos para el correo indicado.");
  const result=await api("/api/auth/verify","POST",{email,code},false);
  if(generation!==emailEpoch)return;
  token=result.token;sessionStorage.setItem("bm-viajes-pilot-token",token);sessionEpoch++;
  if(await ensureAdmin()){value("identity",email);await loadList();}
 });
});
$("refresh").onclick=()=>action($("refresh"),loadList);
$("reload").onclick=()=>{filter=$("filter").value;offset=0;loadList().catch(e=>message(e.message,true));};
$("filter").onchange=()=>{filter=$("filter").value;offset=0;loadList().catch(e=>message(e.message,true));};
$("prev").onclick=()=>{offset=Math.max(0,offset-50);loadList().catch(e=>message(e.message,true));};
$("next").onclick=()=>{if(!hasMore)return;offset+=50;loadList().catch(e=>message(e.message,true));};
$("close-detail").onclick=()=>{$("detail").hidden=true;selectedDriver=null;detailOffset=0;};
$("history-prev").onclick=()=>{detailOffset=Math.max(0,detailOffset-50);loadDetail().catch(e=>message(e.message,true));};
$("history-next").onclick=()=>{if(!detailHasMore)return;detailOffset+=50;loadDetail().catch(e=>message(e.message,true));};
$("logout").onclick=async()=>{
 const old=token;clearSession();message("Sesión local cerrada.");
 if(old)try{await fetch(API+"/api/auth/logout",{method:"POST",headers:{"Authorization":"Bearer "+old},cache:"no-store"});}catch{message("Sesión local cerrada. No se confirmó la revocación remota.",true);}
};
async function boot(){
 if(!API.startsWith("https://")){message("El servidor no está configurado.",true);return;}
 try{
  const health=await api("/api/health","GET",undefined,false);
  if(health.database!=="ready")throw Error("Base de datos aún no disponible.");
  ready=health.email_configured===true;
  $("send-code").disabled=!ready;
  if(token){
    try{
      if(await ensureAdmin()){value("identity","Sesión verificada");await loadList();return;}
    }catch{clearSession();}
  }
  message(ready?"Ingresá con el correo del administrador.":"Panel listo, pero no se pueden enviar códigos nuevos: falta configurar correo del servidor.",!ready);
 }catch(e){message("No se pudo validar el servidor: "+e.message,true);}
}
boot();
})();
