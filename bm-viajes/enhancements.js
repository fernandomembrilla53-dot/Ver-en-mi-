/* UVER - mejoras progresivas 2026. Ubicacion privada y voluntaria. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const origin = $("origin"), dest = $("destination"), panel = $("interactive-map");
  if (!origin || !dest || !panel) return;

  const center = [-37.1515, -58.4859]; // Centro general de Ayacucho (no ubicacion personal).
  const state = {map:null,markers:{},line:null,myLocation:null,watch:null,gpsRequest:0,points:{origin:null,destination:null},pick:null,firstFix:true,gpsOriginLabel:null};
  let streetRoute=null, routeController=null, routeVersion=0;
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
      if(streetRoute)return streetRoute.distance/1000;
      const a=state.points.origin,b=state.points.destination;
      return a&&b?Number(distance(a,b).toFixed(1)):null;
    },
    routeMinutes: () => streetRoute?Math.max(1,Math.ceil(streetRoute.duration/60)):null,
    isPrivateRoute: () => state.gpsOriginLabel!==null,
    hasRoute: () => !!(state.points.origin&&state.points.destination)
  };
  const getLabel = (latlng) => latlng.lat.toFixed(5)+", "+latlng.lng.toFixed(5);
  const markerIcon = (kind) => window.L.divIcon({
    className:"bm-pin-wrap",
    html:'<span class="bm-pin '+kind+'">'+(kind==="origin"?"A":kind==="destination"?"B":"GPS")+'</span>',
    iconSize:[39,40],iconAnchor:[19,37]
  });
  function clearStreetRoute(){
    routeVersion++; routeController?.abort();routeController=null;streetRoute=null;
    if($("street-route"))$("street-route").disabled=false;
    if($("distance-label"))$("distance-label").textContent="Distancia ilustrativa (no ruta vial)";
    if($("time-label"))$("time-label").textContent="Tiempo ilustrativo";
    document.dispatchEvent(new Event("uver-route"));
  }
  async function routeByStreet(){
    const a=state.points.origin,b=state.points.destination;
    if(!a||!b){setStatus("Marcá primero el origen y el destino en el mapa. Una dirección escrita sola no fija un punto.");return;}
    clearStreetRoute();const version=routeVersion;
    routeController=new AbortController();const controller=routeController;
    const timeout=setTimeout(()=>controller.abort(),15000);
    $("street-route").disabled=true;setStatus("Calculando recorrido por calles…");
    try{
      const response=await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`,{signal:controller.signal});
      if(!response.ok)throw Error("routing unavailable");
      const data=await response.json(),r=data.routes?.[0];
      if(data.code!=="Ok"||!r||!Number.isFinite(r.distance)||!Number.isFinite(r.duration)||r.distance<=0||!Array.isArray(r.geometry?.coordinates)||r.geometry.coordinates.length<2||!r.geometry.coordinates.every(c=>Array.isArray(c)&&c.length>=2&&Number.isFinite(c[0])&&Number.isFinite(c[1])&&Math.abs(c[0])<=180&&Math.abs(c[1])<=90))throw Error("invalid route");
      if(version!==routeVersion)return;
      streetRoute=r;
      if(state.line)state.map.removeLayer(state.line);
      state.line=L.polyline(r.geometry.coordinates.map(c=>[c[1],c[0]]),{color:"#172c20",weight:5,opacity:.9}).addTo(state.map);
      state.map.fitBounds(state.line.getBounds(),{padding:[30,60]});
      $("distance-label").textContent="Distancia por calles";$("time-label").textContent="Tiempo estimado · sin tráfico";
      setStatus(`Ruta por calles: ${(r.distance/1000).toFixed(1).replace('.',',')} km · ${Math.ceil(r.duration/60)} min. OSRM, sin tráfico en vivo. Tarifa sólo de ejemplo.`);
      document.dispatchEvent(new Event("uver-route"));
    }catch(e){if(version===routeVersion)setStatus("No se pudo obtener la ruta por calles. Revisá la conexión y reintentá. La línea punteada es sólo distancia aérea.");}
    finally{clearTimeout(timeout);if(version===routeVersion){$("street-route").disabled=false;routeController=null;}}
  }
  $("street-route")?.addEventListener("click",routeByStreet);
  function drawRoute(){
    clearStreetRoute();
    if(!state.map||!window.L)return;
    if(state.line){state.map.removeLayer(state.line);state.line=null;}
    for(const kind of ["origin","destination"]){
      const p=state.points[kind];
      if(state.markers[kind]){state.map.removeLayer(state.markers[kind]);delete state.markers[kind];}
      if(p)state.markers[kind]=L.marker([p.lat,p.lng],{icon:markerIcon(kind)}).addTo(state.map).bindPopup((kind==="origin"?"Partida":"Destino")+" seleccionado en mapa");
    }
    const a=state.points.origin,b=state.points.destination;
    if(a&&b){
      state.line=L.polyline([[a.lat,a.lng],[b.lat,b.lng]],{color:"#758279",weight:5,dashArray:"7 9",opacity:.95}).addTo(state.map);
      setStatus("Distancia aérea aproximada: "+distance(a,b).toFixed(1).replace(".",",")+" km. No es una ruta por calles.");
    }
  }
  function setPoint(kind,latlng){
    const p={lat:Number(latlng.lat),lng:Number(latlng.lng)};
    if(!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||Math.abs(p.lat)>90||Math.abs(p.lng)>180)return;
    if(kind==="origin")state.gpsOriginLabel=null;
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
      const tiles=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{
        maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
      }).addTo(state.map);
      tiles.on("tileerror",()=>setStatus("No se pudieron cargar algunas calles del mapa. Revisá tu conexión."));
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
    const requestId=++state.gpsRequest;
    navigator.geolocation.getCurrentPosition(
      position=>{if(requestId===state.gpsRequest)handlePosition(position);},
      error=>{if(requestId===state.gpsRequest)permissionError(error);},
      {enableHighAccuracy:true,timeout:15000,maximumAge:10000}
    );
  }
  function stopTracking(){
    // Invalidar callbacks GPS pendientes: detener debe prevalecer sobre una respuesta tardía.
    state.gpsRequest++;
    if(state.watch!==null&&navigator.geolocation)navigator.geolocation.clearWatch(state.watch);
    state.watch=null;
    if(state.markers.me&&state.map){state.map.removeLayer(state.markers.me);delete state.markers.me;}
    state.myLocation=null;state.firstFix=true;
    // Si la partida se obtuvo del GPS, retirar también su copia del formulario.
    if(state.gpsOriginLabel!==null&&origin.value===state.gpsOriginLabel){
      origin.value="";state.points.origin=null;emitInput(origin);drawRoute();
    }
    if(state.gpsOriginLabel!==null&&dest.value===state.gpsOriginLabel){dest.value="";state.points.destination=null;emitInput(dest);drawRoute();}
    state.gpsOriginLabel=null;
    $("use-gps-origin").disabled=true;$("share-location").disabled=true;
    setStatus("Ubicación desactivada y eliminada de la sesión.");
  }
  $("swap")?.addEventListener("click",()=>{
    const a=state.points.origin;state.points.origin=state.points.destination;state.points.destination=a;
    drawRoute();
  });
  $("get-gps")?.addEventListener("click",locate);
  $("stop-gps")?.addEventListener("click",stopTracking);
  $("use-gps-origin")?.addEventListener("click",()=>{
    if(state.myLocation){setPoint("origin",state.myLocation);state.gpsOriginLabel=origin.value;}
  });
  $("map-pick-origin")?.addEventListener("click",()=>{state.pick="origin";updatePick();setStatus("Tocá el mapa para marcar dónde comienza el viaje.");});
  $("map-pick-dest")?.addEventListener("click",()=>{state.pick="destination";updatePick();setStatus("Tocá el mapa para marcar tu destino.");});
  // La ruta solo es válida mientras el texto coincide exactamente con el punto elegido.
  // Un prefijo "Mapa: " escrito a mano no debe conservar coordenadas anteriores.
  const matchesMapPoint=(el,kind)=>{
    const p=state.points[kind];
    return !!p && el.value==="Mapa: "+getLabel(p);
  };
  origin.addEventListener("input",()=>{
    if(origin.value!==state.gpsOriginLabel)state.gpsOriginLabel=null;
    if(state.points.origin&&!matchesMapPoint(origin,"origin")){state.points.origin=null;drawRoute();}
  });
  dest.addEventListener("input",()=>{
    if(state.points.destination&&!matchesMapPoint(dest,"destination")){state.points.destination=null;drawRoute();}
  });
  const safeShare=async(text,sharedUrl=location.href.split("#")[0])=>{
    // La API nativa usa el campo URL: compartir coordenadas requiere pasar su enlace explícito.
    // Evitar añadir la URL de la demo a un mensaje que contiene una ubicación privada.
    try{
      if(navigator.share){await navigator.share({title:"UVER",text,url:sharedUrl});return;}
      if(navigator.clipboard){await navigator.clipboard.writeText(text+"\n"+sharedUrl);setStatus("Información copiada para compartir.");return;}
      window.prompt("Copiá este texto para compartir:",text+"\n"+sharedUrl);
    }catch(e){if(e.name!=="AbortError")setStatus("No se pudo compartir desde este navegador.");}
  };
  $("share-trip")?.addEventListener("click",()=>{
    safeShare("UVER (demo sin reservas): "+origin.value+" a "+dest.value+".");
  });
  $("share-location")?.addEventListener("click",()=>{
    if(!state.myLocation)return;
    const p=state.myLocation,coords=p.lat.toFixed(5)+","+p.lng.toFixed(5);
    safeShare("Comparto voluntariamente mi ubicación aproximada.", "https://www.google.com/maps?q="+coords);
  });
  const favoriteKey="bm-viajes-favorite-v1";
  $("save-favorite")?.addEventListener("click",()=>{
    const a=origin.value.trim(),b=dest.value.trim();
    if(!a||!b||a===b){setStatus("Elegí dos lugares distintos antes de guardarlos.");return;}
    // No persistir inadvertidamente la posición GPS personal en localStorage.
    // Los favoritos quedan disponibles para direcciones escritas o puntos elegidos manualmente.
    if(state.gpsOriginLabel!==null&&a===state.gpsOriginLabel){setStatus("Por privacidad, no se guarda tu ubicación GPS como favorito. Escribí una dirección o elegí un punto manualmente.");return;}
    try{localStorage.setItem(favoriteKey,JSON.stringify({a,b}));setStatus("Recorrido favorito guardado en este dispositivo.");}catch(e){setStatus("El navegador no permitió guardar el favorito.");}
  });
  $("load-favorite")?.addEventListener("click",()=>{
    try{
      const x=JSON.parse(localStorage.getItem(favoriteKey)||"null");
      if(!x||typeof x.a!=="string"||typeof x.b!=="string"){setStatus("Todavía no guardaste un recorrido.");return;}
      origin.value=x.a;dest.value=x.b;state.gpsOriginLabel=null;state.points.origin=null;state.points.destination=null;
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
  window.addEventListener("appinstalled",()=>setStatus("UVER se agregó a tu dispositivo."));
  if("serviceWorker" in navigator && location.protocol==="https:"){
    window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}),{once:true});
  }
  initMap();updatePick();
})();
