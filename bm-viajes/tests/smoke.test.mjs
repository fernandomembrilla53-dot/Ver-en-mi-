import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {inflateSync} from "node:zlib";
import worker from "../backend/worker.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=(p)=>readFileSync(resolve(root,p),"utf8");
const exists=(p)=>existsSync(resolve(root,p));
test("Archivos mínimos de PWA, piloto y backend disponibles",()=>{
 for(const p of ["index.html","enhancements.js","pilot.js","piloto.html","config.js","privacidad.html","manifest.webmanifest","sw.js","backend/schema.sql","backend/worker.mjs","icon.svg","icon-192.png","icon-512.png"]){
  assert.ok(exists(p),"Falta "+p);
 }
});
test("Manifiesto instalable y acotado a BM Viajes",()=>{
 const m=JSON.parse(read("manifest.webmanifest"));
 assert.equal(m.lang,"es-AR");assert.equal(m.start_url,"./");assert.equal(m.scope,"./");assert.equal(m.display,"standalone");
 assert.ok(m.icons.some(x=>x.sizes==="192x192" && exists(x.src)));
 assert.ok(m.icons.some(x=>x.sizes==="512x512" && exists(x.src)));
});
test("Iconos PNG válidos y decodificables",()=>{
 for(const n of [192,512]){
  const png=readFileSync(resolve(root,"icon-"+n+".png"));
  assert.equal(png.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
  let off=8,iw=0,ih=0,idats=[];
  while(off+12<=png.length){
   const len=png.readUInt32BE(off);const type=png.toString("ascii",off+4,off+8);
   const data=png.subarray(off+8,off+8+len);
   if(type==="IHDR"){iw=data.readUInt32BE(0);ih=data.readUInt32BE(4);}
   if(type==="IDAT")idats.push(data);
   off+=12+len;if(type==="IEND")break;
  }
  assert.equal(iw,n);assert.equal(ih,n);
  const pixels=inflateSync(Buffer.concat(idats));
  assert.equal(pixels.length,n*(n*4+1));
  for(let i=0;i<n;i++)assert.equal(pixels[i*(n*4+1)],0);
 }
});
test("Recursos referenciados en la interfaz existen",()=>{
 for(const p of ["index.html","piloto.html"]){
  const html=read(p);
  for(const match of html.matchAll(/(?:src|href)="\.\/([^"?#]+)"/g)){
   assert.ok(exists(match[1]),p+" referencia ausente: "+match[1]);
  }
  const ids=[...html.matchAll(/id="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(ids.length,new Set(ids).size,p+" tiene IDs duplicados");
 }
});
test("Demo aclara la simulación y GPS con permiso",()=>{
 const html=read("index.html");
 assert.match(html,/Versión de prueba/);
 assert.match(html,/GPS con permiso/);
 assert.match(html,/privacidad\.html/);
 assert.match(html,/piloto\.html/);
 assert.match(read("enhancements.js"),/navigator\.geolocation\.getCurrentPosition/);
});
test("Cache offline limitado a BM Viajes, sin tiles ni datos de viaje",()=>{
 const sw=read("sw.js");
 assert.match(sw,/url\.origin!==self\.location\.origin/);
 assert.ok(sw.includes('url.pathname.includes("/bm-viajes/")'));
 assert.ok(!sw.includes("tile.openstreetmap.org"));
});
test("API informa correctamente cuando no hay viajes reales habilitados",async()=>{
 const env={DB:{},FRONTEND_ORIGIN:"https://fernandomembrilla53-dot.github.io",ENABLE_LIVE_RIDES:"false"};
 const res=await worker.fetch(new Request("https://api.example.com/api/config"),env);
 assert.equal(res.status,200);
 const data=await res.json();assert.equal(data.live_rides_enabled,false);assert.equal(data.payments_enabled,false);
 assert.equal(data.fare_calculation,"pending_municipal_tariffs");
});
test("CORS válido y bloqueo de origen desconocido",async()=>{
 const env={DB:{},FRONTEND_ORIGIN:"https://fernandomembrilla53-dot.github.io"};
 const ok=await worker.fetch(new Request("https://api.example.com/api/health",{method:"OPTIONS",headers:{Origin:env.FRONTEND_ORIGIN}}),env);
 assert.equal(ok.status,204);assert.equal(ok.headers.get("Access-Control-Allow-Origin"),env.FRONTEND_ORIGIN);
 const bad=await worker.fetch(new Request("https://api.example.com/api/health",{method:"OPTIONS",headers:{Origin:"https://attacker.example"}}),env);
 assert.equal(bad.status,403);
});
test("Esquema conserva permisos de conductor y seguimiento efímero",()=>{
 const schema=read("backend/schema.sql");
 assert.match(schema,/driver_status/);assert.match(schema,/ride_positions/);assert.match(schema,/otp_challenges/);
 assert.match(read("backend/worker.mjs"),/ENABLE_LIVE_RIDES/);
});

test("Cerrar sesión no depende del límite de POST y revoca únicamente el token",async()=>{
 const queries=[];
 const env={
  DB:{prepare(sql){
   queries.push(sql);
   return {bind(...args){assert.equal(args.length,1);return {async run(){return {meta:{changes:1}};}};}};
  }},
  FRONTEND_ORIGIN:"https://fernandomembrilla53-dot.github.io",
  AUTH_SECRET:"x".repeat(40),
  ENABLE_LIVE_RIDES:"false"
 };
 const request=new Request("https://api.example.com/api/auth/logout",{
  method:"POST",headers:{Authorization:"Bearer "+"a".repeat(64),"CF-Connecting-IP":"203.0.113.5"}
 });
 const response=await worker.fetch(request,env);
 assert.equal(response.status,200);
 assert.equal((await response.json()).ok,true);
 assert.equal(queries.length,1,"No debe consultar ni modificar rate_limits");
 assert.match(queries[0],/^DELETE FROM sessions WHERE token_hash=\\?$/);
});
test("Cerrar sesión con token inválido no toca la base",async()=>{
 let calls=0;
 const env={DB:{prepare(){calls++;throw Error("Unexpected database access");}},AUTH_SECRET:"x".repeat(40)};
 const response=await worker.fetch(new Request("https://api.example.com/api/auth/logout",{
  method:"POST",headers:{Authorization:"Bearer invalid"}
 }),env);
 assert.equal(response.status,401);
 assert.equal(calls,0);
});
