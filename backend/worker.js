/* Ver en Mí: API de catálogo y pedidos. Cloudflare Worker + D1. */
import { adminPage } from "./admin-page.js";
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
   if(!await isAdmin(req,env))return error("Acceso de Yami requerido",401);
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
