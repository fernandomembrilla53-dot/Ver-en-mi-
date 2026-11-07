const CACHE="ver-en-mi-v3";
const FILES=["./","./index.html","./daily.js","./premium.css","./manifest.json","./icon.svg","./icon-192.png","./icon-512.png","./privacidad.html"];
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
  try{
   const response=await fetch(req);
   if(response.ok)await cache.put(req,response.clone());
   return response;
  }catch(_){
   const cached=await cache.match(req,{ignoreSearch:true});
   if(cached)return cached;
   if(req.mode==="navigate")return (await cache.match("./index.html"))||Response.error();
   return Response.error();
  }
 })());
});
