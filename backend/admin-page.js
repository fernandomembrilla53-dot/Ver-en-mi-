export const adminPage = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Ver en Mí · Panel de Yami</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f8f3;color:#1c3e31;font-family:system-ui,Arial,sans-serif}header{background:linear-gradient(130deg,#174c39,#2c8661);color:white;padding:22px 18px}header h1{margin:0;font-size:26px}main{max-width:1050px;margin:auto;padding:14px}
.card{background:white;border:1px solid #dae9db;border-radius:19px;padding:16px;margin:14px 0;box-shadow:0 4px 19px #164c3910}h2{margin:0 0 8px;font-size:21px}p{line-height:1.5}
input,select,textarea{display:block;width:100%;border:1px solid #c9dacc;border-radius:10px;padding:10px;font:inherit;color:#214130;background:#fff}label{display:block;margin:10px 0;font-weight:650;font-size:13px}button{background:#17694c;color:#fff;border:0;border-radius:10px;min-height:42px;padding:10px 14px;font:inherit;font-weight:700;cursor:pointer}button:disabled{opacity:.5}
button.secondary{background:#e8f2ea;color:#22654b}.muted{color:#62776c;font-size:13px}.warn{color:#a52f2f}.ok{color:#176c45}.hidden{display:none!important}
.top-row{display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between}.tools{display:flex;flex-wrap:wrap;gap:9px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.product{border:1px solid #dce9df;border-radius:16px;padding:12px;background:#fff}
.photo{width:100%;aspect-ratio:1.6;background:#e4f0e7;background-image:url('/api/atlas');background-repeat:no-repeat;image-rendering:auto;border-radius:12px;max-height:190px}.no-photo{display:grid;place-items:center;color:#6b8376;background-image:none}
.two{display:grid;grid-template-columns:1fr 1fr;gap:9px}.checkbox{display:flex;align-items:center;gap:7px}.checkbox input{width:auto;margin:0;accent-color:#146e50}.price{max-width:180px}
.order{border-top:1px solid #dae6da;padding:12px 0}.order strong{display:block}.order select{max-width:220px}
@media(max-width:400px){.two{grid-template-columns:1fr}.grid{grid-template-columns:1fr}}
</style></head><body>
<header><h1>Ver en Mí · Panel de Yami</h1><div>Lo simple de comer bien</div></header>
<main><section id="login" class="card"><h2>Ingresar a mi tienda</h2><p>Solo la administradora puede publicar y modificar precios.</p><form id="loginForm"><label>Contraseña de administración<input required type="password" name="password" autocomplete="current-password" minlength="12"></label><button type="submit">Entrar</button><p id="loginMsg" role="status" class="warn"></p></form></section>
<section id="app" class="hidden">
<div class="card"><div class="top-row"><div><h2>Mis productos y precios</h2><p class="muted">Las fotos están preparadas sin nombres ni precios antiguos. Primero completá los datos, luego activá Publicar.</p></div><div class="tools"><button id="seed" class="secondary">Importar mis 16 fotos</button><button id="newProduct" class="secondary">Producto nuevo</button><button id="refresh" class="secondary">Actualizar</button><button id="logout" class="secondary">Salir</button></div></div><div id="notice" aria-live="polite"></div></div>
<div id="products" class="grid"></div>
<div class="card"><div class="top-row"><h2>Pedidos de clientes</h2><div class="tools"><button id="notifications" class="secondary">Activar avisos en este celular</button><button id="ordersReload" class="secondary">Revisar pedidos</button></div></div>
<p class="muted">Los pedidos nuevos se ven acá mientras el panel esté abierto. Los avisos instantáneos con la app cerrada requieren configurar otro servicio de notificaciones. Confirmá cada pedido antes de prepararlo.</p><div id="orders"></div></div>
</section></main>
<script>
"use strict";
const $=id=>document.getElementById(id),safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const categories=["Ensaladas","Ensaladas de frutas","Verduras preparadas","Comidas elaboradas","Jugos","Otros","Por clasificar"];
const money=n=>new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(n);
async function api(path,method="GET",body){const r=await fetch(path,{method,credentials:"same-origin",headers:{"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"No fue posible completar la operación.");return d}
function message(s,error=false){$("notice").innerHTML='<p class="'+(error?"warn":"ok")+'" role="status">'+safe(s)+"</p>"}
function crop(el,index){if(!Number.isInteger(index)||index<0||index>15){el.classList.add("no-photo");el.textContent="Foto pendiente";return}
const x=index%4,y=Math.floor(index/4);el.style.backgroundSize="400% 400%";el.style.backgroundPosition=(x*100/3)+"% "+(y*100/3)+"%"}
function drawProducts(products){
const root=$("products");root.replaceChildren();
if(!products.length){root.innerHTML='<p class="card muted">No hay productos cargados. Tocá «Importar mis 16 fotos» para comenzar.</p>';return}
products.forEach(p=>{
const card=document.createElement("form");card.className="product";
card.innerHTML='<div class="photo"></div>'+
'<label>Nombre de la comida<input name="name" maxlength="100" placeholder="Por ejemplo: ensalada a elección" value="'+safe(p.name)+'"></label>'+
'<label>Ingredientes o detalles<textarea name="description" maxlength="400" rows="2" placeholder="Yami completa los ingredientes">'+safe(p.description)+'</textarea></label>'+
'<div class="two"><label>Categoría<select name="category">'+categories.map(c=>'<option '+(p.category===c?'selected':'')+'>'+safe(c)+'</option>').join("")+'</select></label>'+
'<label>Precio actual en pesos<input name="price_ars" class="price" type="number" inputmode="numeric" min="1" max="10000000" step="1" placeholder="Sin precio" value="'+(p.price_ars??"")+'"></label></div>'+
'<div class="two"><label class="checkbox"><input name="active" type="checkbox" '+(p.active?'checked':'')+'>Publicar para clientes</label>'+
'<label class="checkbox"><input name="available" type="checkbox" '+(p.available?'checked':'')+'>Disponible hoy</label></div>'+
'<label class="checkbox"><input name="featured" type="checkbox" '+(p.featured&&p.menu_date===today?'checked':'')+'>Destacar en el menú de hoy</label>'+
'<button type="submit">Guardar cambios</button><p class="muted">Foto '+(p.photo_index==null?"nueva":"#"+(p.photo_index+1))+' · '+(p.active?"Publicado":"Borrador, no visible para clientes")+'</p><p role="status" class="feedback"></p>';
crop(card.querySelector(".photo"),p.photo_index);
card.onsubmit=async e=>{e.preventDefault();const f=new FormData(card),button=card.querySelector('button[type=submit]'),feedback=card.querySelector(".feedback");button.disabled=true;feedback.textContent="Guardando…";
const data={name:String(f.get("name")||""),description:String(f.get("description")||""),category:String(f.get("category")||"Otros"),price_ars:f.get("price_ars")===""?null:Number(f.get("price_ars")),active:!!f.get("active"),available:!!f.get("available"),featured:!!f.get("featured")};
try{if(p.id)await api("/api/admin/products/"+p.id,"PUT",data);else await api("/api/admin/products","POST",data);feedback.className="feedback ok";feedback.textContent="Guardado correctamente.";setTimeout(loadProducts,700)}
catch(err){feedback.className="feedback warn";feedback.textContent=err.message}finally{button.disabled=false}};
root.append(card);
});
}
let today="",lastOrderIds=new Set(),hasLoadedOrders=false;
async function loadProducts(){const data=await api("/api/admin/products");today=data.today;drawProducts(data.products)}
async function loadOrders(){const data=await api("/api/admin/orders"),root=$("orders");root.replaceChildren();
const list=data.orders||[];
if(hasLoadedOrders&&list.some(o=>o.status==="pendiente"&&!lastOrderIds.has(o.id))&&"Notification" in window&&Notification.permission==="granted")new Notification("Ver en Mí: nuevo pedido",{body:"Ingresó un nuevo pedido para revisar"});
lastOrderIds=new Set(list.map(o=>o.id));hasLoadedOrders=true;
if(!list.length){root.innerHTML='<p class="muted">Todavía no hay pedidos.</p>';return}
list.forEach(o=>{
 const card=document.createElement("div");card.className="order";
 const date=new Date(o.created_at).toLocaleString("es-AR",{timeZone:"America/Argentina/Buenos_Aires"});
 card.innerHTML='<strong>Pedido #'+safe(o.id.slice(0,8))+' · '+money(o.total_ars)+'</strong><p>'+safe(date)+' · '+safe(o.name)+' · '+safe(o.phone)+'</p><p>'+safe(o.delivery)+(o.address?' · '+safe(o.address):'')+'</p><p>'+safe(o.notes)+'</p><p>'+o.items.map(x=>safe(x.product_name)+' x '+x.quantity).join(" · ")+'</p>';
 const select=document.createElement("select");["pendiente","confirmado","preparando","entregado","cancelado"].forEach(status=>{const op=document.createElement("option");op.value=status;op.textContent=status;op.selected=o.status===status;select.append(op)});
 const button=document.createElement("button");button.className="secondary";button.textContent="Guardar estado";button.onclick=async()=>{button.disabled=true;try{await api("/api/admin/orders/"+o.id,"PUT",{status:select.value});await loadOrders()}catch(err){message(err.message,true)}finally{button.disabled=false}};
 card.append(select,button);root.append(card);
});
}
async function refresh(){try{await Promise.all([loadProducts(),loadOrders()])}catch(err){message(err.message,true)}}
$("loginForm").onsubmit=async e=>{e.preventDefault();const data=new FormData(e.target),b=e.target.querySelector("button");b.disabled=true;
try{await api("/api/admin/login","POST",{password:data.get("password")});$("login").classList.add("hidden");$("app").classList.remove("hidden");await refresh()}
catch(err){$("loginMsg").textContent=err.message}finally{b.disabled=false}};
$("seed").onclick=async()=>{if(!confirm("¿Importar las 16 fotografías de productos como borradores sin precios?"))return;try{await api("/api/admin/seed","POST",{});message("Fotos importadas como borradores. Completá nombre y precio antes de publicar.");await loadProducts()}catch(err){message(err.message,true)}};
$("newProduct").onclick=()=>drawProducts([{name:"",description:"",category:"Por clasificar",active:0,available:1,featured:0,photo_index:null},...currentProducts]);
let currentProducts=[];
const oldDraw=drawProducts;drawProducts=function(items){currentProducts=items;oldDraw(items)};
$("refresh").onclick=refresh;$("ordersReload").onclick=loadOrders;
$("notifications").onclick=async()=>{if("Notification" in window){const p=await Notification.requestPermission();message(p==="granted"?"Avisos habilitados mientras el panel esté abierto.":"No se habilitaron avisos.")}else message("Este navegador no admite notificaciones.",true)};
$("logout").onclick=async()=>{try{await api("/api/admin/logout","POST",{})}catch(_){}location.reload()};
setInterval(()=>{if(!$("app").classList.contains("hidden")&&!document.hidden)loadOrders().catch(()=>{})},30000);
refresh().then(()=>{$("login").classList.add("hidden");$("app").classList.remove("hidden")}).catch(()=>{});
</script></body></html>`;