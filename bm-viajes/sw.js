/* BM Viajes: la app se puede abrir sin conexión; los mapas requieren Internet.
   Nunca guarda en caché ubicaciones GPS ni datos del servidor. */
const CACHE="bm-viajes-shell-2026-11-11-uver-v11";
const SHELL=["./","./index.html","./manifest.webmanifest","./icon.svg","./icon-192.png","./icon-512.png","./enhancements.js","./uver.css?v=20261111-2","./uver.js","./piloto.html","./pilot.js","./config.js","./privacidad.html"];
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("bm-viajes-shell-")&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET")return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return; // No cachear tiles, pagos, API ni CDN.
 const scopePath=new URL(self.registration.scope).pathname;
 if(!url.pathname.startsWith(scopePath))return;
 // Navegaciones: no almacenar respuestas HTML arbitrarias (podrían contener datos personales).
 // La pantalla piloto tiene su propio fallback; rutas desconocidas no se disfrazan de inicio.
 if(request.mode==="navigate"){
  const path=url.pathname.replace(/\/+$/,"/");
  const base=new URL("./",self.registration.scope).pathname;
  const fallback=path===base||path===base+"index.html"?"./index.html":
    path===base+"piloto.html"?"./piloto.html":
    path===base+"privacidad.html"?"./privacidad.html":null;
  event.respondWith(fetch(request).catch(async()=>{
   if(fallback){const cached=await caches.match(fallback);if(cached)return cached;}
   return new Response("Sin conexión. Volvé a intentarlo cuando tengas Internet.",{
    status:503,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}
   });
  }));
  return;
 }
 // Solo recursos públicos explícitos: nunca cachear endpoints, parámetros ni rutas nuevas.
 const allowed=new Set(SHELL.map(path=>new URL(path,self.registration.scope).pathname));
 const exact=new Set(SHELL.map(path=>new URL(path,self.registration.scope).href));
 if((url.search && !exact.has(url.href)) || !allowed.has(url.pathname))return;
 // La configuración de la API y la política de privacidad deben renovarse
 // desde la red: una versión cacheada de config.js puede bloquear la conexión.
 if(url.pathname===new URL("./config.js",self.registration.scope).pathname ||
    url.pathname===new URL("./privacidad.html",self.registration.scope).pathname){
  event.respondWith(fetch(request).catch(()=>caches.match(request)));
  return;
 }
 event.respondWith(caches.match(request).then(hit=>hit||fetch(request)));
});
