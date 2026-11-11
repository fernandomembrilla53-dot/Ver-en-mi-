import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";

const sw=readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),"../sw.js"),"utf8");
const scope="https://fernandomembrilla53-dot.github.io/Ver-en-mi-/bm-viajes/";

function serviceWorker({offline=false,cacheValue="caché anterior"}={}){
 const handlers={};
 let networkCalls=0,cacheCalls=0;
 const sandbox={
  URL,Request,Response,
  self:{location:{origin:new URL(scope).origin},registration:{scope},addEventListener:(type,fn)=>{handlers[type]=fn;}},
  caches:{match:async()=>{cacheCalls++;return new Response(cacheValue);}},
  fetch:async()=>{networkCalls++;if(offline)throw Error("sin conexión");return new Response("respuesta actualizada");}
 };
 runInNewContext(sw,sandbox);
 return {async request(path){let reply;const request=new Request(new URL(path,scope));handlers.fetch({request,respondWith:p=>{reply=p;}});return reply?await reply:null;},stats:()=>({networkCalls,cacheCalls})};
}

test("La PWA obtiene config.js actualizado de la red antes de consultar la caché",async()=>{
 const sw=serviceWorker();
 const response=await sw.request("config.js");
 assert.equal(await response.text(),"respuesta actualizada");
 assert.deepEqual(sw.stats(),{networkCalls:1,cacheCalls:0});
});

test("Sin conexión config.js conserva la copia local para mostrar la app",async()=>{
 const sw=serviceWorker({offline:true});
 const response=await sw.request("config.js");
 assert.equal(await response.text(),"caché anterior");
 assert.deepEqual(sw.stats(),{networkCalls:1,cacheCalls:1});
});

test("La política de privacidad también se renueva online",async()=>{
 const sw=serviceWorker();
 const response=await sw.request("privacidad.html");
 assert.equal(await response.text(),"respuesta actualizada");
});

test("Los recursos públicos fijos mantienen caché offline",async()=>{
 const sw=serviceWorker({offline:true});
 const response=await sw.request("icon.svg");
 assert.equal(await response.text(),"caché anterior");
 assert.deepEqual(sw.stats(),{networkCalls:0,cacheCalls:1});
});

test("Un endpoint no permitido no se cachea ni se intercepta",async()=>{
 const sw=serviceWorker();
 assert.equal(await sw.request("api/rides/mine"),null);
 assert.deepEqual(sw.stats(),{networkCalls:0,cacheCalls:0});
});
