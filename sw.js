/* Ver en Mi: offline con actualización resiliente y caché acotada. */
const CACHE="ver-en-mi-v11";
const FILES=["./","./index.html","./daily.js","./premium.css","./manifest.json","./icon.svg","./icon-192.png","./icon-512.png","./privacidad.html","./store.css","./store-config.js","./store.js","./assets/producto-01.jpg","./assets/producto-02.jpg","./assets/producto-03.jpg","./assets/producto-04.jpg","./assets/producto-05.jpg","./assets/producto-06.jpg","./assets/producto-07.jpg","./assets/producto-08.jpg","./assets/producto-09.jpg","./assets/producto-10.jpg","./assets/producto-11.jpg","./assets/producto-12.jpg","./assets/producto-13.jpg","./assets/producto-14.jpg","./assets/producto-15.jpg","./assets/producto-16.jpg"];
const APP_SHELL=new URL("./index.html",self.registration.scope).href;
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)));
 self.skipWaiting();
});
self.addEventListener("activate",event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("ver-en-mi-")&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
 const req=event.request;
 if(req.method!=="GET"||new URL(req.url).origin!==self.location.origin)return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  const isNavigation=req.mode==="navigate";
  const url=new URL(req.url);
  // La app tiene rutas estáticas. No guardar copias adicionales por parámetros
  // de búsqueda ni documentos ajenos a la PWA.
  const inScope=url.href.startsWith(self.registration.scope);
  const relative=inScope?url.pathname.slice(new URL(self.registration.scope).pathname.length):null;
  const isAppPage=isNavigation&&(relative===""||relative==="index.html");
  try{
   const response=await fetch(req);
   if(response.ok&&inScope){
    // Una cuota de almacenamiento agotada no debe convertir una respuesta
    // online válida en un error ni forzar la versión anterior.
    const key=isAppPage?APP_SHELL:new URL(url.pathname,self.location.origin).href;
    const allowed=FILES.some(path=>new URL(path,self.registration.scope).href===key);
    if(allowed)await cache.put(key,response.clone()).catch(()=>{});
   }
   return response;
  }catch(_){
   const key=isAppPage?APP_SHELL:new URL(url.pathname,self.location.origin).href;
   const cached=await cache.match(key);
   if(cached)return cached;
   if(isNavigation&&inScope)return (await cache.match(APP_SHELL))||Response.error();
   return Response.error();
  }
 })());
});
