/* BM Viajes: la app se puede abrir sin conexión; los mapas requieren Internet.
   Nunca guarda en caché ubicaciones GPS ni datos del servidor. */
const CACHE="bm-viajes-shell-2026-11-09-v5";
const SHELL=["./","./index.html","./manifest.webmanifest","./icon.svg","./icon-192.png","./icon-512.png","./enhancements.js","./piloto.html","./pilot.js","./config.js","./privacidad.html"];
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
 if(!url.pathname.includes("/bm-viajes/"))return;
 // Navegaciones: no almacenar respuestas HTML arbitrarias (podrían contener datos personales).
 // La pantalla piloto tiene su propio fallback; rutas desconocidas no se disfrazan de inicio.
 if(request.mode==="navigate"){
  const path=url.pathname.replace(/\/+$/,"/");
  const base=new URL("./",self.registration.scope).pathname;
  const fallback=path===base||path===base+"index.html"?"./index.html":
    path===base+"piloto.html"?"./piloto.html":null;
  event.respondWith(fetch(request).catch(async()=>{
   if(fallback){const cached=await caches.match(fallback);if(cached)return cached;}
   return new Response("Sin conexión. Volvé a intentarlo cuando tengas Internet.",{
    status:503,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}
   });
  }));
  return;
 }
 if(url.pathname.includes("/api/"))return;
 event.respondWith(caches.match(request).then(hit=>hit||fetch(request).then(response=>{
   if(response.ok && response.type==="basic"){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)));}
   return response;
 })));
});
