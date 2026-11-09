/* BM Viajes - mejoras progresivas 2026. Ubicacion privada y voluntaria. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const origin = $("origin"), dest = $("destination"), panel = $("interactive-map");
  if (!origin || !dest || !panel) return;

  const center = [-37.1515, -58.4859]; // Centro general de Ayacucho (no ubicacion personal).
  const state = {map:null,markers:{},line:null,myLocation:null,watch:null,points:{origin:null,destination:null},pick:null,firstFix:true};
  const status = $("gps-status");
  const setStatus = (msg) => { if(status) status.textContent=msg; };
  const emitInput = (el) => el.dispatchEvent(new Event("input",{bubbles:true}));
  function distance(a,b) {
    const r=6371,toRad=Math.PI/180;
    const dLat=(b.lat-a.lat)*toRad,dLon=(b.lng-a.lng)*toRad;
    const s=Math.sin(dLat/2)**2 + Math.cos(a.lat*toRad)*Math.cos(b.lat*toRad)*Math.sin(dLon/2)**2;
    return r*2*Math.asin(Math.min(1,Math.sqrt(s)));
  }
  window.BMGeo = {
    routeDistanceKm: () => {
      const a=state.points.origin,b=state.points.destination;
      return a&&b?Number(distance(a,b).toFixed(1)):null;
    },
    hasRoute: () => !!(state.points.origin&&state.points.destination)
  };
  const getLabel = (latlng) => latlng.lat.toFixed(5)+", "+latlng.lng.toFixed(5);
  const markerIcon = (kind) => window.L.divIcon({
    className:"bm-pin-wrap",
    html:'<span class="bm-pin '+kind+'">'+(kind==="origin"?"A":kind==="destination"?"B":"GPS")+'</span>',
    iconSize:[39,40],iconAnchor:[19,37]
  });
  function drawRoute(){
    if(!state.map||!window.L)return;
    if(state.line){state.map.removeLayer(state.line);state.line=null;}
    for(const kind of ["origin","destination"]){
      const p=state.points[kind];
      if(state.markers[kind]){state.map.removeLayer(state.markers[kind]);delete state.markers[kind];}
      if(p)state.markers[kind]=L.marker([p.lat,p.lng],{icon:markerIcon(kind)}).addTo(state.map).bindPopup((kind==="origin"?"Partida":"Destino")+" seleccionado en mapa");
    }
    const a=state.points.origin,b=state.points.destination;
    if(a&&b){
      state.line=L.polyline([[a.lat,a.lng],[b.lat,b.lng]],{color:"#e3a341",weight:5,dashArray:"7 9",opacity:.95}).addTo(state.map);
      setStatus("Distancia aérea aproximada: "+distance(a,b).toFixed(1).replace(".",",")+" km. No es una ruta por calles.");
    }
  }
  function setPoint(kind,latlng){
    const p={lat:Number(latlng.lat),lng:Number(latlng.lng)};
    if(!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||Math.abs(p.lat)>90||Math.abs(p.lng)>180)return;
    state.points[kind]=p;
    const el=kind==="origin"?origin:dest;
    el.value="Mapa: "+getLabel(p);
    emitInput(el);
    state.pick=null; updatePick(); drawRoute();
  }
  function updatePick(){
    const a=$("map-pick-origin"),b=$("map-pick-dest");
    if(a)a.setAttribute("aria-pressed",String(state.pick==="origin"));
    if(b)b.setAttribute("aria-pressed",String(state.pick==="destination"));
    if(panel)panel.style.cursor=state.pick?"crosshair":"grab";
  }
  function initMap(){
    if(!window.L){setStatus("Sin conexión para cargar el mapa. La simulación sigue disponible.");return;}
    try{
      state.map=L.map(panel,{zoomControl:true,scrollWheelZoom:false}).setView(center,14);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{
        maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
      }).addTo(state.map);
      panel.classList.add("map-ready");
      const aside=panel.closest(".map-panel");
      if(aside) aside.classList.add("has-live-map");
      state.map.on("click",function(e){ if(state.pick)setPoint(state.pick,e.latlng); });
      window.addEventListener("resize",()=>state.map.invalidateSize(),{passive:true});
      document.addEventListener("visibilitychange",()=>{if(!document.hidden)state.map.invalidateSize();});
      setStatus("Mapa activo. Podés señalar tu partida y destino; los precios siguen siendo simulados.");
    }catch(e){setStatus("No se pudo iniciar el mapa, podés seguir con la demostración.");}
  }
  function permissionError(err){
    const messages={1:"No diste permiso al GPS. Podés seguir sin compartir tu ubicación.",2:"No se pudo determinar la ubicación.",3:"El GPS tardó demasiado. Probá al aire libre."};
    setStatus(messages[err&&err.code]||"No se pudo acceder a tu ubicación.");
  }
  function handlePosition(position){
    const c=position.coords;
    if(!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude))return;
    state.myLocation={lat:c.latitude,lng:c.longitude,accuracy:c.accuracy||0};
    if(state.map){
      const latlng=[c.latitude,c.longitude];
      if(state.markers.me){state.markers.me.setLatLng(latlng);}
      else state.markers.me=L.marker(latlng,{icon:markerIcon("me")}).addTo(state.map).bindPopup("Mi ubicación aproximada (solo en este dispositivo)");
      if(state.firstFix){state.map.setView(latlng,16);state.firstFix=false;}
    }
    setStatus("GPS obtenido con permiso. Precisión aproximada: "+Math.round(c.accuracy||0)+" m. No se envía a BM-Apps.");
    if($("use-gps-origin"))$("use-gps-origin").disabled=false;
    if($("share-location"))$("share-location").disabled=false;
  }
  function locate(){
    if(!("geolocation" in navigator)){setStatus("Este dispositivo no admite geolocalización.");return;}
    setStatus("Solicitando permiso de ubicación al dispositivo...");
    navigator.geolocation.getCurrentPosition(handlePosition,permissionError,{enableHighAccuracy:true,timeout:15000,maximumAge:10000});
  }
  function stopTracking(){
    if(state.watch!==null&&navigator.geolocation)navigator.geolocation.clearWatch(state.watch);
    state.watch=null;
    if(state.markers.me&&state.map){state.map.removeLayer(state.markers.me);delete state.markers.me;}
    state.myLocation=null;state.firstFix=true;
    $("use-gps-origin").disabled=true;$("share-location").disabled=true;
    setStatus("Ubicación desactivada y eliminada de la sesión.");
  }
  $("get-gps")?.addEventListener("click",locate);
  $("stop-gps")?.addEventListener("click",stopTracking);
  $("use-gps-origin")?.addEventListener("click",()=>{
    if(state.myLocation)setPoint("origin",state.myLocation);
  });
  $("map-pick-origin")?.addEventListener("click",()=>{state.pick="origin";updatePick();setStatus("Tocá el mapa para marcar dónde comienza el viaje.");});
  $("map-pick-dest")?.addEventListener("click",()=>{state.pick="destination";updatePick();setStatus("Tocá el mapa para marcar tu destino.");});
  origin.addEventListener("input",()=>{if(!origin.value.startsWith("Mapa: ")){state.points.origin=null;drawRoute();}});
  dest.addEventListener("input",()=>{if(!dest.value.startsWith("Mapa: ")){state.points.destination=null;drawRoute();}});
  const safeShare=async(text)=>{
    try{
      if(navigator.share){await navigator.share({title:"BM Viajes",text,url:location.href.split("#")[0]});return;}
      if(navigator.clipboard){await navigator.clipboard.writeText(text+"\n"+location.href.split("#")[0]);setStatus("Información copiada para compartir.");return;}
      window.prompt("Copiá este texto para compartir:",text+"\n"+location.href.split("#")[0]);
    }catch(e){if(e.name!=="AbortError")setStatus("No se pudo compartir desde este navegador.");}
  };
  $("share-trip")?.addEventListener("click",()=>{
    safeShare("BM Viajes (demo sin reservas): "+origin.value+" a "+dest.value+".");
  });
  $("share-location")?.addEventListener("click",()=>{
    if(!state.myLocation)return;
    const p=state.myLocation,coords=p.lat.toFixed(5)+","+p.lng.toFixed(5);
    safeShare("Comparto voluntariamente mi ubicación aproximada: https://www.google.com/maps?q="+coords);
  });
  const favoriteKey="bm-viajes-favorite-v1";
  $("save-favorite")?.addEventListener("click",()=>{
    const a=origin.value.trim(),b=dest.value.trim();
    if(!a||!b||a===b){setStatus("Elegí dos lugares distintos antes de guardarlos.");return;}
    try{localStorage.setItem(favoriteKey,JSON.stringify({a,b}));setStatus("Recorrido favorito guardado en este dispositivo.");}catch(e){setStatus("El navegador no permitió guardar el favorito.");}
  });
  $("load-favorite")?.addEventListener("click",()=>{
    try{
      const x=JSON.parse(localStorage.getItem(favoriteKey)||"null");
      if(!x||typeof x.a!=="string"||typeof x.b!=="string"){setStatus("Todavía no guardaste un recorrido.");return;}
      origin.value=x.a;dest.value=x.b;state.points.origin=null;state.points.destination=null;
      emitInput(origin);emitInput(dest);drawRoute();setStatus("Recorrido favorito cargado.");
    }catch(e){setStatus("No se pudo recuperar el recorrido.");}
  });
  const connectivity=()=>{
    const el=$("connection-status");if(!el)return;
    el.textContent=navigator.onLine?"Con conexión":"Sin conexión";
    el.dataset.online=String(navigator.onLine);
  };
  window.addEventListener("online",connectivity);window.addEventListener("offline",connectivity);connectivity();
  let prompt=null;
  window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();prompt=e;const b=$("install-app");if(b)b.hidden=false;});
  $("install-app")?.addEventListener("click",async()=>{
    if(prompt){prompt.prompt();await prompt.userChoice;prompt=null;$("install-app").hidden=true;}
    else setStatus("Para instalar: abrí el menú de Chrome y elegí «Instalar aplicación» o «Agregar a pantalla principal».");
  });
  window.addEventListener("appinstalled",()=>setStatus("BM Viajes se agregó a tu dispositivo."));
  if("serviceWorker" in navigator && location.protocol==="https:"){
    window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}),{once:true});
  }
  initMap();updatePick();
})();
