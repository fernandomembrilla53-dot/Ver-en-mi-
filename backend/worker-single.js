const adminPage = "<!doctype html>\n<html lang=\"es\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><meta name=\"robots\" content=\"noindex,nofollow\">\n<title>Ver en Mí · Panel de productos</title>\n<style>\n:root{font-family:system-ui,-apple-system,sans-serif;color:#18382d;background:#f5f8f3}\n*{box-sizing:border-box}body{margin:0}header{background:#185940;color:white;padding:18px 16px}header h1{margin:0;font-size:24px}header p{margin:5px 0;color:#dbede1}\nmain{max-width:1100px;padding:14px;margin:auto}.card{background:white;border:1px solid #dce9de;border-radius:19px;padding:17px;margin:13px 0;box-shadow:0 4px 18px #183a2d0b}\nh2{margin:0 0 9px;font-size:20px}h3{font-size:17px;margin:0 0 9px}p{line-height:1.45}\nbutton{border:0;border-radius:10px;padding:11px 14px;background:#15664c;color:#fff;font:600 14px system-ui;cursor:pointer;min-height:43px}\nbutton.secondary{background:#e1f0e5;color:#15563d}button:disabled{opacity:.55}\ninput,select,textarea{display:block;width:100%;background:#fff;color:#182e21;border:1px solid #bbd0c1;border-radius:10px;padding:10px;font:inherit;font-size:16px}\nlabel{display:block;font-weight:600;margin:10px 0 6px;font-size:14px}\ninput[type=checkbox]{width:auto;accent-color:#176c4d}.check{display:flex;gap:7px;align-items:center}\n.hidden{display:none!important}.muted{font-size:13px;color:#64776b}.warn{color:#a4322f}.ok{color:#12613e}\n.flex{display:flex;flex-wrap:wrap;gap:9px;align-items:center;justify-content:space-between}.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}\n.product{border:1px solid #deebdf;border-radius:16px;padding:13px;background:white}\n.product-photo{width:100%;max-height:260px;min-height:125px;object-fit:contain;background:#f2f7f1;border-radius:11px}\n.no-photo{height:125px;display:grid;place-items:center;border-radius:11px;background:#edf4ef;color:#567262}\n.field-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:11px}.inline-actions{display:flex;gap:9px;align-items:center;flex-wrap:wrap}\n.badge{font-size:11px;background:#e6f6e9;border-radius:30px;padding:4px 8px;color:#176749}\n.order{border-top:1px solid #e2e9e3;padding:13px 0;overflow-wrap:anywhere}.order select{max-width:230px;margin:9px 0}\n@media(max-width:390px){.field-row{grid-template-columns:1fr}.cols{grid-template-columns:1fr}}\n</style></head><body>\n<header><h1>Ver en Mí · Panel de productos</h1><p>Lo simple de comer bien</p></header>\n<main>\n<section class=\"card\" id=\"login\"><h2>Ingresar</h2><p class=\"muted\">Este panel es privado. Solo el personal autorizado puede modificar productos, precios y fotos.</p>\n<form id=\"loginForm\"><label>Contraseña<input type=\"password\" name=\"password\" required autocomplete=\"current-password\"></label><button type=\"submit\">Entrar a mi tienda</button><p class=\"warn\" id=\"loginMsg\" role=\"status\"></p></form></section>\n<div id=\"app\" class=\"hidden\">\n<section class=\"card\">\n<div class=\"flex\"><div><h2>Mis productos</h2><p class=\"muted\">Elegí una foto de buena calidad (se ajustará sin recortes si es muy pesada), escribí nombre y precio y activá Publicar.</p></div>\n<div class=\"inline-actions\"><button id=\"add\" type=\"button\">Agregar producto</button><button id=\"refresh\" class=\"secondary\" type=\"button\">Actualizar</button><button id=\"logout\" class=\"secondary\" type=\"button\">Salir</button></div></div>\n<p id=\"notice\" role=\"status\"></p></section>\n<div id=\"products\" class=\"cols\"></div>\n<section class=\"card\"><div class=\"flex\"><h2>Pedidos recibidos</h2><button class=\"secondary\" id=\"ordersRefresh\" type=\"button\">Actualizar pedidos</button></div>\n<p class=\"muted\">El panel muestra pedidos y permite confirmarlos. Los avisos automáticos con la app cerrada requieren configurar el correo del comercio o notificaciones push.</p><div id=\"orders\"></div></section>\n</div></main>\n<script>\n\"use strict\";\nconst $=id=>document.getElementById(id);\nconst safe=x=>String(x??\"\").replace(/[&<>\"']/g,c=>({\"&\":\"&amp;\",\"<\":\"&lt;\",\">\":\"&gt;\",'\"':\"&quot;\",\"'\":\"&#39;\"}[c]));\nconst money=n=>new Intl.NumberFormat(\"es-AR\",{style:\"currency\",currency:\"ARS\",maximumFractionDigits:0}).format(n);\nconst categories=[\"Ensaladas\",\"Ensaladas de frutas\",\"Verduras picadas\",\"Verduras preparadas\",\"Comidas elaboradas\",\"Jugos\",\"Otros\"];\nconst showMessage=(s,bad=false)=>{$(\"notice\").className=bad?\"warn\":\"ok\";$(\"notice\").textContent=s};\nasync function api(path,method=\"GET\",data){\n const res=await fetch(path,{method,credentials:\"same-origin\",headers:{\"Content-Type\":\"application/json\"},body:data===undefined?undefined:JSON.stringify(data)});\n const value=await res.json().catch(()=>({}));if(!res.ok)throw Error(value.error||\"No se pudo completar la operación\");return value;\n}\nasync function preparePhoto(file){\n if(file.size<=600000)return file; // Mantener bytes originales cuando el tamaño permite D1.\n const bitmap=await createImageBitmap(file).catch(()=>null);\n if(!bitmap)throw Error(\"No pude abrir la foto. Probá con JPG.\");\n try{\n  const biggest=Math.max(bitmap.width,bitmap.height);\n  const canvas=document.createElement(\"canvas\");\n  const ctx=canvas.getContext(\"2d\",{alpha:false});\n  if(!ctx)throw Error(\"Este navegador no permite preparar la imagen.\");\n  const opts=[[1600,.9],[1600,.84],[1400,.84],[1200,.8],[1050,.78]];\n  for(const [maxDim,quality] of opts){\n   const ratio=Math.min(1,maxDim/biggest);\n   canvas.width=Math.max(1,Math.round(bitmap.width*ratio));\n   canvas.height=Math.max(1,Math.round(bitmap.height*ratio));\n   ctx.fillStyle=\"white\";ctx.fillRect(0,0,canvas.width,canvas.height);\n   ctx.drawImage(bitmap,0,0,canvas.width,canvas.height); // Respeta el encuadre completo.\n   const blob=await new Promise(resolve=>canvas.toBlob(resolve,\"image/jpeg\",quality));\n   if(blob&&blob.size<=600000)return new File([blob],file.name.replace(/\\.[^.]+$/,\"\")+\".jpg\",{type:\"image/jpeg\"});\n  }\n  throw Error(\"Esta imagen es demasiado grande. Elegí otra de buena calidad.\");\n }finally{bitmap.close?.()}\n}\nasync function uploadPhoto(id,file){\n if(!file||!file.size)return;\n if(file.size>15*1024*1024)throw Error(\"La imagen original no debe superar 15 MB\");\n if(![\"image/jpeg\",\"image/png\",\"image/webp\"].includes(file.type))throw Error(\"Solo fotos JPG, PNG o WebP\");\n const optimized=await preparePhoto(file);\n const body=new FormData();body.append(\"photo\",optimized);\n const res=await fetch(\"/api/admin/products/\"+encodeURIComponent(id)+\"/photo\",{method:\"POST\",body,credentials:\"same-origin\"});\n const data=await res.json().catch(()=>({}));\n if(!res.ok)throw Error(data.error||\"No se pudo subir la fotografía\");return data;\n}\nfunction productCard(p){\n const form=document.createElement(\"form\");form.className=\"product\";\n const title=document.createElement(\"h3\");title.textContent=p.id?\"Editar producto\":\"Nuevo producto\";\n form.append(title);\n if(p.photo_url){\n  const photo=document.createElement(\"img\");photo.className=\"product-photo\";photo.src=p.photo_url;photo.alt=\"Fotografía original del producto\";photo.loading=\"lazy\";form.append(photo);\n }else{\n  const empty=document.createElement(\"div\");empty.className=\"no-photo\";empty.textContent=\"Todavía no tiene fotografía\";form.append(empty);\n }\n const fields=document.createElement(\"div\");\n fields.innerHTML='<label>Foto original (JPG, PNG o WebP)<input type=\"file\" name=\"photo\" accept=\"image/jpeg,image/png,image/webp\"></label>'+\n '<label>Nombre del producto<input name=\"name\" maxlength=\"100\" value=\"'+safe(p.name||\"\")+'\" placeholder=\"Escribí el nombre del producto\"></label>'+\n '<label>Ingredientes y descripción<textarea rows=\"2\" name=\"description\" maxlength=\"400\" placeholder=\"Ingredientes que lleva\">'+safe(p.description||\"\")+'</textarea></label>'+\n '<div class=\"field-row\"><div><label>Categoría<select name=\"category\">'+categories.map(c=>'<option value=\"'+safe(c)+'\" '+(c===p.category?\"selected\":\"\")+'>'+safe(c)+'</option>').join(\"\")+'</select></label></div>'+\n '<div><label>Precio de hoy ($ ARS)<input type=\"number\" min=\"1\" max=\"10000000\" step=\"1\" name=\"price_ars\" inputmode=\"numeric\" placeholder=\"Precio sin cargar\" value=\"'+(Number.isInteger(p.price_ars)?p.price_ars:\"\")+'\"></label></div></div>'+\n '<label class=\"check\"><input type=\"checkbox\" name=\"available\" '+(p.available?\"checked\":\"\")+'> Disponible para vender</label>'+\n '<label class=\"check\"><input type=\"checkbox\" name=\"featured\" '+(p.featured&&p.menu_date===localToday?\"checked\":\"\")+'> Menú del día</label>'+\n '<label class=\"check\"><input type=\"checkbox\" name=\"active\" '+(p.active?\"checked\":\"\")+'> Publicar para los clientes</label>';\n form.append(fields);\n const controls=document.createElement(\"div\");controls.className=\"inline-actions\";\n const save=document.createElement(\"button\");save.type=\"submit\";save.textContent=\"Guardar producto y precio\";\n const state=document.createElement(\"span\");state.className=\"badge\";state.textContent=p.active?\"Publicado\":\"Borrador\";\n controls.append(save,state);form.append(controls);\n const msg=document.createElement(\"p\");msg.setAttribute(\"role\",\"status\");form.append(msg);\n form.onsubmit=async event=>{\n  event.preventDefault();const fd=new FormData(form);\n  const file=fd.get(\"photo\"),hasNewPhoto=file instanceof File&&file.size>0;\n  const intent={\n   name:String(fd.get(\"name\")||\"\").trim(),description:String(fd.get(\"description\")||\"\").trim(),\n   category:String(fd.get(\"category\")||\"Otros\"),price_ars:fd.get(\"price_ars\")===\"\"?null:Number(fd.get(\"price_ars\")),\n   active:!!fd.get(\"active\"),available:!!fd.get(\"available\"),featured:!!fd.get(\"featured\")\n  };\n  if(intent.active&&(!intent.name||!Number.isInteger(intent.price_ars)||(!p.photo_url&&!hasNewPhoto))){\n   msg.className=\"warn\";msg.textContent=\"Para publicar, agregá foto, nombre y precio actual.\";return;\n  }\n  save.disabled=true;msg.className=\"muted\";msg.textContent=\"Guardando…\";\n  try{\n   let id=p.id;\n   if(!id){\n    const created=await api(\"/api/admin/products\",\"POST\",{...intent,active:false});\n    id=created.id;\n   }else{\n    await api(\"/api/admin/products/\"+id,\"PUT\",{...intent,active:hasNewPhoto?false:intent.active});\n   }\n   if(hasNewPhoto)await uploadPhoto(id,file);\n   if(intent.active&&(!p.id||hasNewPhoto))await api(\"/api/admin/products/\"+id,\"PUT\",intent);\n   msg.className=\"ok\";msg.textContent=\"Guardado correctamente.\";\n   await loadProducts();showMessage(\"Producto actualizado. Los clientes verán los cambios cuando actualicen la sección Comidas.\");\n  }catch(error){msg.className=\"warn\";msg.textContent=error.message}finally{save.disabled=false}\n };\n return form;\n}\nlet localToday=\"\",products=[];\nasync function loadProducts(){\n const data=await api(\"/api/admin/products\");products=data.products||[];localToday=data.today||\"\";\n const root=$(\"products\");root.replaceChildren();\n if(products.length===0){const note=document.createElement(\"p\");note.className=\"card muted\";note.textContent=\"Todavía no hay productos. Tocá Agregar producto para comenzar.\";root.append(note);return}\n products.forEach(p=>root.append(productCard(p)));\n}\nasync function loadOrders(){\n const data=await api(\"/api/admin/orders\"),root=$(\"orders\");root.replaceChildren();\n if(!data.orders?.length){root.innerHTML='<p class=\"muted\">Todavía no hay pedidos.</p>';return}\n for(const o of data.orders){\n  const el=document.createElement(\"div\");el.className=\"order\";\n  const t=document.createElement(\"strong\");t.textContent=\"Pedido #\"+o.id.slice(0,8)+\" · \"+money(o.total_ars);\n  const who=document.createElement(\"p\");who.textContent=o.name+\" · \"+o.phone+\" · \"+o.delivery+(o.address?\" · \"+o.address:\"\");\n  const items=document.createElement(\"p\");items.textContent=(o.items||[]).map(x=>x.product_name+\" x\"+x.quantity).join(\" · \");\n  el.append(t,who,items);\n  if(o.notes){const note=document.createElement(\"p\");note.textContent=o.notes;el.append(note)}\n  const sel=document.createElement(\"select\");\n  for(const status of [\"pendiente\",\"confirmado\",\"preparando\",\"entregado\",\"cancelado\"]){const opt=document.createElement(\"option\");opt.value=status;opt.textContent=status;if(o.status===status)opt.selected=true;sel.append(opt)}\n  const button=document.createElement(\"button\");button.className=\"secondary\";button.textContent=\"Guardar estado\";button.onclick=async()=>{button.disabled=true;try{await api(\"/api/admin/orders/\"+o.id,\"PUT\",{status:sel.value});showMessage(\"Estado del pedido guardado\");await loadOrders()}catch(e){showMessage(e.message,true)}finally{button.disabled=false}};\n  el.append(sel,button);root.append(el);\n }\n}\nasync function refresh(){await Promise.all([loadProducts(),loadOrders()])}\n$(\"loginForm\").onsubmit=async event=>{\n event.preventDefault();const submit=event.target.querySelector(\"button\");submit.disabled=true;\n try{await api(\"/api/admin/login\",\"POST\",{password:new FormData(event.target).get(\"password\")});$(\"login\").classList.add(\"hidden\");$(\"app\").classList.remove(\"hidden\");await refresh()}\n catch(e){$(\"loginMsg\").textContent=e.message}finally{submit.disabled=false}\n};\n$(\"add\").onclick=()=>{const form=productCard({name:\"\",description:\"\",category:\"Ensaladas\",price_ars:null,available:true,active:false,featured:false});$(\"products\").prepend(form);form.scrollIntoView({behavior:\"smooth\",block:\"start\"})};\n$(\"refresh\").onclick=()=>refresh().catch(e=>showMessage(e.message,true));\n$(\"ordersRefresh\").onclick=()=>loadOrders().catch(e=>showMessage(e.message,true));\n$(\"logout\").onclick=async()=>{try{await api(\"/api/admin/logout\",\"POST\",{})}catch(e){}location.reload()};\nsetInterval(()=>{if(!$(\"app\").classList.contains(\"hidden\")&&!document.hidden)loadOrders().catch(()=>{})},30000);\nrefresh().then(()=>{$(\"login\").classList.add(\"hidden\");$(\"app\").classList.remove(\"hidden\")}).catch(()=>{});\n</script></body></html>";

/* Ver en Mí: API de catálogo y pedidos. Cloudflare Worker + D1. */
const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers}});
const error=(message,status=400)=>json({error:message},status);
const tzToday=()=>{const p=new Intl.DateTimeFormat("en-US",{timeZone:"America/Argentina/Buenos_Aires",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const pick=t=>p.find(x=>x.type===t)?.value;return pick("year")+"-"+pick("month")+"-"+pick("day")};
const validDate=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+"T12:00:00Z"));
const good=s=>typeof s==="string"?s.trim():"";
const bounded=(s,max)=>good(s).slice(0,max);
const cookieName="vem_admin";
const bytes=new TextEncoder();
const b64=a=>btoa(String.fromCharCode(...new Uint8Array(a))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
async function mac(secret,value){const key=await crypto.subtle.importKey("raw",bytes.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64(await crypto.subtle.sign("HMAC",key,bytes.encode(value)))}
const secureEq=(a,b)=>{if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0};
async function signedCookie(env){const exp=Math.floor(Date.now()/1000)+86400;const payload="v1."+exp+"."+crypto.randomUUID();return payload+"."+await mac(env.SESSION_SECRET,payload)}
async function isAdmin(req,env){if(!env.SESSION_SECRET)return false;const cookie=(req.headers.get("cookie")||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(cookieName+"="));if(!cookie)return false;const value=cookie.slice(cookieName.length+1),pieces=value.split(".");if(pieces.length!==4||pieces[0]!=="v1"||!/^\d+$/.test(pieces[1])||Number(pieces[1])<Date.now()/1000)return false;const payload=pieces.slice(0,3).join(".");return secureEq(pieces[3],await mac(env.SESSION_SECRET,payload))}
const ipOf=req=>req.headers.get("CF-Connecting-IP")||"unknown";
async function rateLimit(db,key,limit,seconds){const now=Math.floor(Date.now()/1000),min=now-seconds;
 await db.prepare("DELETE FROM request_limits WHERE at_time < ?").bind(now-86400).run();
 const row=await db.prepare("SELECT COUNT(*) AS c FROM request_limits WHERE identity=? AND at_time >= ?").bind(key,min).first();
 if(Number(row?.c||0)>=limit)return false;
 await db.prepare("INSERT INTO request_limits(identity,at_time) VALUES (?,?)").bind(key,now).run();return true;}
const allowedOrigin=(req,env)=>{const origin=req.headers.get("Origin");return !!origin&&origin===env.APP_ORIGIN};
const cors=(req,env)=>allowedOrigin(req,env)?{"Access-Control-Allow-Origin":env.APP_ORIGIN,"Vary":"Origin","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Access-Control-Max-Age":"600"}:{};
const publicJson=(req,env,value,status=200)=>json(value,status,cors(req,env));
const badPublic=(req,env,message,status=400)=>publicJson(req,env,{error:message},status);
async function parseBody(req){if(Number(req.headers.get("content-length")||0)>50000)throw Error("Solicitud demasiado extensa");return await req.json()}
const toPublic=p=>({id:p.id,name:p.name,description:p.description,category:p.category,price_ars:p.price_ars,photo_index:p.photo_index,photo_url:p.photo_url,featured:Number(p.featured)===1&&p.menu_date===tzToday(),available:!!p.available});
async function notifyOrder(env,order,items){
 if(!env.BREVO_API_KEY||!env.ORDER_NOTIFY_EMAIL||!env.NOTIFY_SENDER_EMAIL)return false;
 try{
 const text=items.map(x=>x.name+" x"+x.qty+" = $"+x.subtotal).join("\n");
 const body={sender:{email:env.NOTIFY_SENDER_EMAIL,name:"Ver en Mí"},to:[{email:env.ORDER_NOTIFY_EMAIL}],subject:"Nuevo pedido Ver en Mí #"+order.id.slice(0,8),textContent:"Pedido #"+order.id+"\nCliente: "+order.name+"\nTeléfono: "+order.phone+"\nEntrega: "+order.delivery+"\nDirección: "+order.address+"\nNotas: "+order.notes+"\n\n"+text+"\nTotal: $"+order.total_ars+"\nConfirmar en el panel administrativo."};
 const response=await fetch("https://api.brevo.com/v3/smtp/email",{method:"POST",headers:{"content-type":"application/json","api-key":env.BREVO_API_KEY},body:JSON.stringify(body)});
 return response.ok;
 }catch(_){return false}
}

/* Create missing D1 tables on first request (avoids Cloudflare SQL console challenge). */
const INITIAL_SQL = ["CREATE TABLE IF NOT EXISTS products (\n id TEXT PRIMARY KEY,\n name TEXT NOT NULL DEFAULT '',\n description TEXT NOT NULL DEFAULT '',\n category TEXT NOT NULL DEFAULT 'Por clasificar',\n price_ars INTEGER,\n photo_index INTEGER UNIQUE,\n photo_url TEXT,\n photo_key TEXT,\n active INTEGER NOT NULL DEFAULT 0,\n available INTEGER NOT NULL DEFAULT 1,\n featured INTEGER NOT NULL DEFAULT 0,\n menu_date TEXT NOT NULL DEFAULT '',\n created_at TEXT NOT NULL,\n updated_at TEXT NOT NULL\n)","CREATE INDEX IF NOT EXISTS products_active ON products(active,available,category)","CREATE TABLE IF NOT EXISTS orders (\n id TEXT PRIMARY KEY,\n name TEXT NOT NULL,\n phone TEXT NOT NULL,\n delivery TEXT NOT NULL,\n address TEXT NOT NULL DEFAULT '',\n notes TEXT NOT NULL DEFAULT '',\n total_ars INTEGER NOT NULL,\n status TEXT NOT NULL DEFAULT 'pendiente',\n created_at TEXT NOT NULL\n)","CREATE TABLE IF NOT EXISTS order_items (\n id INTEGER PRIMARY KEY AUTOINCREMENT,\n order_id TEXT NOT NULL REFERENCES orders(id),\n product_id TEXT NOT NULL,\n product_name TEXT NOT NULL,\n quantity INTEGER NOT NULL,\n unit_price_ars INTEGER NOT NULL\n)","CREATE TABLE IF NOT EXISTS request_limits (\n identity TEXT NOT NULL,\n at_time INTEGER NOT NULL\n)","CREATE INDEX IF NOT EXISTS request_limits_lookup ON request_limits(identity,at_time)","CREATE TABLE IF NOT EXISTS product_photos (\n product_id TEXT PRIMARY KEY,\n content_type TEXT NOT NULL,\n image_base64 TEXT NOT NULL,\n updated_at TEXT NOT NULL\n)"];
let initPromise;
async function initializeDatabase(db) {
 if(!initPromise) initPromise=db.batch(INITIAL_SQL.map(sql=>db.prepare(sql))).catch(e=>{initPromise=null;throw e});
 return initPromise;
}
function base64FromBytes(bytes){
 let out="";for(let i=0;i<bytes.length;i+=16384)out+=String.fromCharCode(...bytes.subarray(i,i+16384));
 return btoa(out);
}

export default {async fetch(req,env){
 const url=new URL(req.url),path=url.pathname,method=req.method;
 if(!env.DB)return error("Base de datos sin configurar",503);
 try{await initializeDatabase(env.DB)}catch(e){console.error("D1 init",e?.message);return error("No se pudo configurar la base de datos",503);}
 if(method==="OPTIONS"&&path.startsWith("/api/")&&allowedOrigin(req,env))return new Response(null,{status:204,headers:cors(req,env)});
 if(path==="/admin"&&method==="GET")return new Response(adminPage,{headers:{"content-type":"text/html;charset=utf-8","cache-control":"no-store","X-Frame-Options":"DENY","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"}});
 if(/^\/api\/photos\/[a-z0-9-]+$/.test(path)&&method==="GET"){
  const id=path.slice("/api/photos/".length);
  try {
   const p=await env.DB.prepare("SELECT active,available FROM products WHERE id=?").bind(id).first();
   if(!p)return error("Foto no encontrada",404);
   if((!p.active||!p.available)&&!await isAdmin(req,env))return error("Foto no disponible",404);
   const photo=await env.DB.prepare("SELECT content_type,image_base64 FROM product_photos WHERE product_id=?").bind(id).first();
   if(!photo)return error("Foto no encontrada",404);
   const binary=Uint8Array.from(atob(photo.image_base64),c=>c.charCodeAt(0));
   return new Response(binary,{headers:{"content-type":photo.content_type,"x-content-type-options":"nosniff","cache-control":p.active?"public,max-age=300":"private,no-store","access-control-allow-origin":"*","cross-origin-resource-policy":"cross-origin"}});
  }catch(e){console.error("Photo error",e?.message);return error("No se pudo abrir la foto",500)}
 }

 try{
  if(path==="/api/menu"&&method==="GET"){
   const q=await env.DB.prepare("SELECT * FROM products WHERE active=1 AND available=1 AND name <> '' AND price_ars IS NOT NULL AND price_ars > 0 ORDER BY CASE WHEN featured=1 AND menu_date=? THEN 0 ELSE 1 END, CASE WHEN category='Ensaladas' THEN 0 ELSE 1 END, updated_at DESC LIMIT 200").bind(tzToday()).all();
   return publicJson(req,env,{date:tzToday(),products:(q.results||[]).map(toPublic)});
  }
  if(path==="/api/orders"&&method==="POST"){
   if(!allowedOrigin(req,env))return badPublic(req,env,"Origen no autorizado",403);
   if(!await rateLimit(env.DB,"order:"+ipOf(req),8,3600))return badPublic(req,env,"Demasiados pedidos. Intentá más tarde.",429);
   const input=await parseBody(req),items=input?.items;
   const name=bounded(input?.name,100),phone=bounded(input?.phone,30),address=bounded(input?.address,180),notes=bounded(input?.notes,300),delivery=input?.delivery;
   if(name.length<2||!/^[0-9+()\-\s]{6,30}$/.test(phone)||!["retiro","envio"].includes(delivery)||delivery==="envio"&&!address||!Array.isArray(items)||items.length<1||items.length>20)return badPublic(req,env,"Completá los datos del pedido.",400);
   const ids=new Set(),lines=[];let total=0;
   for(const it of items){if(typeof it?.id!=="string"||ids.has(it.id)||!Number.isInteger(it.quantity)||it.quantity<1||it.quantity>20)return badPublic(req,env,"Cantidad o producto inválido.");ids.add(it.id);
    const p=await env.DB.prepare("SELECT * FROM products WHERE id=? AND active=1 AND available=1 AND price_ars > 0 AND name <> ''").bind(it.id).first();
    if(!p)return badPublic(req,env,"Un producto dejó de estar disponible. Actualizá el menú.",409);
    const subtotal=p.price_ars*it.quantity;total+=subtotal;if(total>100000000)return badPublic(req,env,"El pedido excede el límite.");
    lines.push({id:p.id,name:p.name,qty:it.quantity,price:p.price_ars,subtotal});
   }
   if(!Number.isSafeInteger(input.quoted_total_ars)||input.quoted_total_ars!==total)return badPublic(req,env,"Cambió el precio de algún producto. Revisá el carrito antes de confirmar.",409);
   const order={id:crypto.randomUUID(),name,phone,delivery,address,notes,total_ars:total};
   await env.DB.batch([
    env.DB.prepare("INSERT INTO orders(id,name,phone,delivery,address,notes,total_ars,status,created_at) VALUES (?,?,?,?,?,?,?,'pendiente',?)").bind(order.id,name,phone,delivery,address,notes,total,new Date().toISOString()),
    ...lines.map(l=>env.DB.prepare("INSERT INTO order_items(order_id,product_id,product_name,quantity,unit_price_ars) VALUES (?,?,?,?,?)").bind(order.id,l.id,l.name,l.qty,l.price))
   ]);
   const notified=await notifyOrder(env,order,lines);
   return publicJson(req,env,{order_id:order.id,total_ars:total,notification_sent:notified},201);
  }
  if(path==="/api/admin/login"&&method==="POST"){
   if(req.headers.get("Origin")!==url.origin)return error("Origen no autorizado",403);
   if(!env.ADMIN_PASSWORD||!env.SESSION_SECRET||env.ADMIN_PASSWORD.length<12||env.SESSION_SECRET.length<32)return error("Credenciales del administrador sin configurar",503);
   if(!await rateLimit(env.DB,"login:"+ipOf(req),7,1200))return error("Demasiados intentos. Probá en unos minutos.",429);
   const data=await parseBody(req),candidate=String(data?.password||"");
   const ok=secureEq(await mac(env.SESSION_SECRET,candidate),await mac(env.SESSION_SECRET,env.ADMIN_PASSWORD));
   if(!ok)return error("Contraseña incorrecta",401);
   return json({ok:true},200,{"Set-Cookie":cookieName+"="+await signedCookie(env)+"; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400"});
  }
  if(path.startsWith("/api/admin/")){
   if(!await isAdmin(req,env))return error("Acceso de administración requerido",401);
   if(method!=="GET"&&req.headers.get("Origin")!==url.origin)return error("Origen no autorizado",403);
   if(path==="/api/admin/logout"&&method==="POST")return json({ok:true},200,{"Set-Cookie":cookieName+"=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0"});
   if(path==="/api/admin/products"&&method==="GET"){
    const q=await env.DB.prepare("SELECT * FROM products ORDER BY COALESCE(photo_index,999), created_at").all();return json({products:q.results||[],today:tzToday()});
   }
   if(path==="/api/admin/products"&&method==="POST"){
    const p=await parseBody(req),id=crypto.randomUUID(),name=bounded(p?.name,100),desc=bounded(p?.description,400),category=bounded(p?.category,45)||"Otros";
    const price=p?.price_ars==null||p.price_ars===""?null:Number(p.price_ars),active=Boolean(p?.active),available=Boolean(p?.available);
    if(price!==null&&(!Number.isSafeInteger(price)||price<1||price>10000000)||active)return error("Primero guardá el borrador, subí la foto y luego publicá.");
    const when=Boolean(p?.featured)?tzToday():"";const now=new Date().toISOString();
    await env.DB.prepare("INSERT INTO products(id,name,description,category,price_ars,photo_index,photo_url,active,available,featured,menu_date,created_at,updated_at) VALUES (?,?,?,?,?,NULL,NULL,?,?,?,?,?,?)").bind(id,name,desc,category,price,Number(active),Number(available),Number(Boolean(p?.featured)),when,now,now).run();
    return json({ok:true,id},201);
   }
   const uploadMatch=/^\/api\/admin\/products\/([a-z0-9-]+)\/photo$/.exec(path);
   if(uploadMatch&&method==="POST"){
    const id=uploadMatch[1],current=await env.DB.prepare("SELECT id FROM products WHERE id=?").bind(id).first();
    if(!current)return error("Producto no encontrado",404);
    if(Number(req.headers.get("content-length")||0)>1024*1024)return error("Foto demasiado grande. Reducí su tamaño.",413);
    const form=await req.formData(),file=form.get("photo");
    if(!(file instanceof File)||file.size<100||file.size>650000)return error("La foto debe pesar menos de 650 KB después de optimizarla");
    const mime={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"};
    if(!mime[file.type])return error("Solo se admiten JPG, PNG o WebP");
    const buffer=new Uint8Array(await file.arrayBuffer());
    const jpeg=buffer[0]===255&&buffer[1]===216&&buffer[2]===255;
    const png=buffer[0]===137&&buffer[1]===80&&buffer[2]===78&&buffer[3]===71;
    const webp=buffer[0]===82&&buffer[1]===73&&buffer[2]===70&&buffer[3]===70&&buffer[8]===87&&buffer[9]===69;
    if(!(file.type==="image/jpeg"&&jpeg||file.type==="image/png"&&png||file.type==="image/webp"&&webp))return error("Formato de foto inválido");
    const now=new Date().toISOString(),encoded=base64FromBytes(buffer);
    const photoUrl=url.origin+"/api/photos/"+id+"?v="+Date.now();
    await env.DB.batch([
     env.DB.prepare("INSERT INTO product_photos(product_id,content_type,image_base64,updated_at) VALUES(?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET content_type=excluded.content_type,image_base64=excluded.image_base64,updated_at=excluded.updated_at").bind(id,file.type,encoded,now),
     env.DB.prepare("UPDATE products SET photo_key=?,photo_url=?,photo_index=NULL,updated_at=? WHERE id=?").bind("d1:"+id,photoUrl,now,id)
    ]);
    return json({ok:true,photo_url:photoUrl});
   }
   const match=/^\/api\/admin\/products\/([\w-]+)$/.exec(path);
   if(match&&method==="PUT"){
    const current=await env.DB.prepare("SELECT id,photo_key FROM products WHERE id=?").bind(match[1]).first();if(!current)return error("Producto inexistente",404);
    const p=await parseBody(req),name=bounded(p?.name,100),desc=bounded(p?.description,400),category=bounded(p?.category,45)||"Otros";
    const price=p?.price_ars==null||p.price_ars===""?null:Number(p.price_ars),active=Boolean(p?.active),available=Boolean(p?.available);
    if(price!==null&&(!Number.isSafeInteger(price)||price<1||price>10000000)||active&&(!name||price===null||!current.photo_key))return error("Para publicar necesitás nombre, foto original y precio actual.");
    const when=Boolean(p?.featured)?tzToday():"";
    await env.DB.prepare("UPDATE products SET name=?,description=?,category=?,price_ars=?,active=?,available=?,featured=?,menu_date=?,updated_at=? WHERE id=?").bind(name,desc,category,price,Number(active),Number(available),Number(Boolean(p?.featured)),when,new Date().toISOString(),match[1]).run();
    return json({ok:true});
   }
   if(path==="/api/admin/orders"&&method==="GET"){
    const q=await env.DB.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 100").all();const rows=q.results||[];
    for(const row of rows){const items=await env.DB.prepare("SELECT * FROM order_items WHERE order_id=?").bind(row.id).all();row.items=items.results||[];}
    return json({orders:rows});
   }
   const statusMatch=/^\/api\/admin\/orders\/([0-9a-f-]+)$/.exec(path);
   if(statusMatch&&method==="PUT"){const d=await parseBody(req),status=d?.status;if(!["pendiente","confirmado","preparando","entregado","cancelado"].includes(status))return error("Estado inválido");
    await env.DB.prepare("UPDATE orders SET status=? WHERE id=?").bind(status,statusMatch[1]).run();return json({ok:true});}
   return error("Ruta administrativa no encontrada",404);
  }
  return error("Ruta no encontrada",404);
 }catch(e){console.error("Worker error",e?.message);return error("Ocurrió un problema. Intentá nuevamente.",500)}
}};
