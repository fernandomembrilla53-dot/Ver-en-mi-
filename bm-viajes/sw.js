/* BM Viajes: la app se puede abrir sin conexión; los mapas requieren Internet.
   Nunca guarda en caché ubicaciones GPS ni datos del servidor. */
const CACHE="bm-viajes-shell-2026-11-09-v2";
const SHELL=["./","./index.html","./manifest.webmanifest","./icon.svg","./enhancements.js"];
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
 if(request.mode==="navigate"){
  event.respondWith(fetch(request).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put("./index.html",copy)));}
    return response;
  }).catch(()=>caches.match("./index.html")));
  return;
 }
 if(url.pathname.includes("/api/"))return;
 event.respondWith(caches.match(request).then(hit=>hit||fetch(request).then(response=>{
   if(response.ok && response.type==="basic"){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)));}
   return response;
 })));
});
