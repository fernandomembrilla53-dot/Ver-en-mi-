/* BM Viajes - cliente de piloto. Sin API configurada no opera viajes. */
(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const BASE=String(window.BM_VIAJES_API_URL||"").trim().replace(/\/$/,"");
  const center=[-37.1515,-58.4859];
  let token=sessionStorage.getItem("bm-viajes-pilot-token")||"";
  let user=null,live=false,map=null,pick=null,markers={},line=null,coords={origin:null,destination:null},myRides=[],tab="passenger";
  let pickupGeneration=0,authGeneration=0;
  let refreshTimer=null,sessionEpoch=0,refreshGeneration=0,requestPending=false,acceptPending=new Set();
  function alertText(message,bad=false){
    const el=$("pilot-alert");el.hidden=false;el.textContent=message;el.className="status"+(bad?" error":" success");
  }
  function serverStatus(message,cls=""){
    const el=$("pilot-api-state");el.textContent=message;el.className="status"+(cls?" "+cls:"");
  }
  async function api(path,method="GET",payload=null){
    if(!BASE)throw Error("Servidor no configurado.");
    const headers={"Accept":"application/json"};
    if(payload!==null)headers["Content-Type"]="application/json";
    if(token)headers.Authorization="Bearer "+token;
    const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),15000);
    try{
      const res=await fetch(BASE+path,{method,headers,body:payload!==null?JSON.stringify(payload):undefined,signal:abort.signal,cache:"no-store",mode:"cors"});
      const data=await res.json().catch(()=>({}));
      if(!res.ok)throw Error(data.error||"El servidor respondió "+res.status);
      return data;
    }finally{clearTimeout(timeout);}
  }
  function setUser(next){
    sessionEpoch++;
    stopGpsShare();
    clearDriverLocation();
    requestPending=false;acceptPending=new Set();
    user=next;
    $("login-section").hidden=!!next;$("user-area").hidden=!next;
    if(next){
      $("user-email").textContent=next.email;
      $("user-role").textContent=next.driver_status==="approved"?"Conductor habilitado para el piloto":next.driver_status==="pending"?"Revisión de conductor pendiente":"Cuenta de pasajero";
      $("driver-status").textContent=next.driver_status==="approved"?"Cuenta revisada para el piloto.":"Estado de conductor: "+(next.driver_status||"no solicitado")+". No podés recibir viajes hasta la verificación manual.";
      $("driver-apply").disabled=next.driver_status==="approved"||next.driver_status==="pending";
      if(!map)initMap();else setTimeout(()=>map.invalidateSize(),50);
      if(refreshTimer)clearInterval(refreshTimer);
      refreshTimer=setInterval(()=>{if(!document.hidden)refresh().catch(()=>{});},15000);
      refreshWithFeedback();
    }else{
      if(refreshTimer)clearInterval(refreshTimer);refreshTimer=null;
      // Clear account-specific text even while the account panel is hidden.
      $("user-email").textContent="";$("user-role").textContent="";$("driver-status").textContent="";
      $("my-rides").textContent="Sin viajes.";$("driver-current").textContent="Sin viaje asignado.";$("available-rides").textContent="Sin pedidos.";
    }
  }
  const latText=(p)=>p.lat.toFixed(5)+", "+p.lng.toFixed(5);
  const pos=(latlng)=>({lat:Number(latlng.lat),lng:Number(latlng.lng)});
  const distKm=(a,b)=>{const r=Math.PI/180,dlat=(b.lat-a.lat)*r,dlng=(b.lng-a.lng)*r;const x=Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlng/2)**2;return (2*6371*Math.asin(Math.min(1,Math.sqrt(x)))).toFixed(1);};
  function redraw(){
    if(!map||!window.L)return;
    for(const k of ["origin","destination"]){
      if(markers[k])map.removeLayer(markers[k]);
      const p=coords[k];
      if(p)markers[k]=L.marker([p.lat,p.lng]).addTo(map).bindPopup(k==="origin"?"Inicio A":"Destino B");
    }
    if(line)map.removeLayer(line);
    if(coords.origin&&coords.destination){
      line=L.polyline([[coords.origin.lat,coords.origin.lng],[coords.destination.lat,coords.destination.lng]],{color:"#f0a832",weight:5,dashArray:"8 8"}).addTo(map);
      $("pickup-status").textContent="A: "+latText(coords.origin)+" · B: "+latText(coords.destination)+". Distancia aérea: "+distKm(coords.origin,coords.destination)+" km, no ruta de calles.";
    }else $("pickup-status").textContent=coords.origin?"Elegiste origen A. Ahora marcá B.":"Elegí origen y destino en el mapa.";
    $("request-ride").disabled=!(user&&live&&!requestPending&&coords.origin&&coords.destination);
    $("set-pickup").setAttribute("aria-pressed",String(pick==="origin"));
    $("set-dropoff").setAttribute("aria-pressed",String(pick==="destination"));
  }
  function setPoint(key,p){
    const x=pos(p);if(!Number.isFinite(x.lat)||!Number.isFinite(x.lng)||Math.abs(x.lat)>90||Math.abs(x.lng)>180)return;
    coords[key]=x;pick=null;redraw();
  }
  function initMap(){
    if(!window.L){alertText("El mapa no pudo cargarse; necesitás Internet para elegir puntos.",true);return;}
    try{
      map=L.map("pilot-map",{scrollWheelZoom:false}).setView(center,14);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).addTo(map);
      map.on("click",e=>{if(pick)setPoint(pick,e.latlng);});
      window.addEventListener("resize",()=>map?.invalidateSize(),{passive:true});
    }catch(e){alertText("Error cargando mapa.",true);}
  }
  $("set-pickup").addEventListener("click",()=>{pickupGeneration++;pick="origin";redraw();alertText("Tocá un punto en el mapa para marcar el origen A.");});
  $("set-dropoff").addEventListener("click",()=>{pickupGeneration++;pick="destination";redraw();alertText("Tocá un punto en el mapa para marcar el destino B.");});
  $("gps-pickup").addEventListener("click",()=>{
    if(!user){alertText("Iniciá sesión antes de utilizar el GPS del piloto.",true);return;}
    if(!navigator.geolocation){alertText("GPS no disponible.",true);return;}
    const epoch=sessionEpoch,generation=++pickupGeneration;
    navigator.geolocation.getCurrentPosition(p=>{
      if(epoch!==sessionEpoch||generation!==pickupGeneration||!user)return; // Ignorar GPS pendiente tras cerrar sesión o cambiar de usuario.
      setPoint("origin",{lat:p.coords.latitude,lng:p.coords.longitude});map?.setView([p.coords.latitude,p.coords.longitude],16);
      alertText("Tu ubicación quedó marcada solo en esta sesión, hasta que elijas enviar un viaje.");
    },()=>{
      if(epoch===sessionEpoch&&generation===pickupGeneration&&user)alertText("No se obtuvo permiso de GPS. Podés señalar el lugar en el mapa.",true);
    },{enableHighAccuracy:true,timeout:15000,maximumAge:10000});
  });
  // Driver coordinates are transient: never persist them or leave a stale marker visible.
  let driverMarker=null,driverMarkerTimer=null,driverMarkerRide=null,driverLocationGeneration=0;
  function clearDriverLocation(){
    driverLocationGeneration++;
    if(driverMarkerTimer!==null)clearTimeout(driverMarkerTimer);
    driverMarkerTimer=null;
    if(driverMarker&&map)map.removeLayer(driverMarker);
    driverMarker=null;driverMarkerRide=null;
  }
  function displayDriverLocation(rideId,position){
    clearDriverLocation();
    if(!map||!window.L||!position||typeof position.lat!=="number"||typeof position.lng!=="number"||
       !Number.isFinite(position.lat)||!Number.isFinite(position.lng)||Math.abs(position.lat)>90||Math.abs(position.lng)>180)return false;
    // The server may return a position up to two minutes old. Never extend its freshness on repeated reads.
    const age=Date.now()-position.updated_at;
    if(typeof position.updated_at!=="number"||!Number.isFinite(age)||age< -5000||age>=15000)return false;
    const remaining=Math.min(15000,15000-Math.max(0,age));
    driverMarker=L.circleMarker([position.lat,position.lng],{radius:9,color:"#153043",fillColor:"#f6bd56",fillOpacity:1,weight:3}).addTo(map).bindTooltip("Última posición del conductor");
    driverMarkerRide=rideId;
    map.setView([position.lat,position.lng],16);
    driverMarkerTimer=setTimeout(clearDriverLocation,remaining);
    return true;
  }
  // Explicit foreground-only GPS consent; never resume automatically.
  let gpsShare=null;
  function canShareGps(rideId){
    return !!user&&live&&user.driver_status==="approved"&&tab==="driver"&&!document.hidden&&
      myRides.some(x=>x.id===rideId&&x.driver_id===user.id&&x.status==="in_progress");
  }
  function stopGpsShare(){
    const share=gpsShare;gpsShare=null;
    if(share&&share.watch!==null)navigator.geolocation.clearWatch(share.watch);
    syncGpsButtons();
  }
  function syncGpsButtons(){
    document.querySelectorAll("[data-gps-share]").forEach(b=>{
      const active=gpsShare?.rideId===b.dataset.gpsShare;
      b.textContent=active?"Detener GPS compartido":"Compartir GPS mientras esta pantalla esté abierta";
      b.setAttribute("aria-pressed",String(active));
    });
  }
  function startGpsShare(rideId){
    if(!canShareGps(rideId)||!navigator.geolocation)return;
    stopGpsShare();
    const share={rideId,watch:null,lastSent:null,busy:false};
    gpsShare=share;
    const current=()=>gpsShare===share&&canShareGps(rideId);
    try{
      share.watch=navigator.geolocation.watchPosition(async p=>{
        if(!current()){if(gpsShare===share)stopGpsShare();return;}
        const now=Date.now(),c=p.coords;
        if(share.busy||(share.lastSent!==null&&now-share.lastSent<6000)||
          !Number.isFinite(p.timestamp)||now-p.timestamp>10000||p.timestamp>now+5000||
          !Number.isFinite(c.latitude)||Math.abs(c.latitude)>90||
          !Number.isFinite(c.longitude)||Math.abs(c.longitude)>180||
          !Number.isFinite(c.accuracy)||c.accuracy<0)return;
        share.busy=true;share.lastSent=now;
        try{await api("/api/rides/"+rideId+"/location","POST",{position:{lat:c.latitude,lng:c.longitude},accuracy_m:c.accuracy});}
        catch(e){if(current()){stopGpsShare();alertText("GPS detenido: "+e.message,true);}}
        finally{share.busy=false;}
      },()=>{if(gpsShare===share){stopGpsShare();alertText("GPS detenido: permiso o ubicación no disponible.",true);}},
      {enableHighAccuracy:true,timeout:12000,maximumAge:0});
      syncGpsButtons();
    }catch(e){stopGpsShare();alertText("No se pudo iniciar el GPS.",true);}
  }
  document.addEventListener("visibilitychange",()=>{if(document.hidden)stopGpsShare();});
  window.addEventListener("pagehide",stopGpsShare);
  function rideCard(ride,asDriver){
    const card=document.createElement("div");card.className="trip";
    const strong=document.createElement("strong");strong.textContent="Viaje "+ride.id.slice(0,8)+" · "+ride.status;
    const detail=document.createElement("small");detail.textContent=new Date(ride.created_at).toLocaleString("es-AR");
    card.append(strong,detail);
    function action(label,next,method){
      const b=document.createElement("button");b.type="button";b.className="btn secondary";b.textContent=label;
      b.addEventListener("click",async()=>{if(!user||b.disabled)return;const epoch=sessionEpoch;const current=()=>epoch===sessionEpoch&&!!user;b.disabled=true;if(asDriver&&next.status==="completed")stopGpsShare();try{await api("/api/rides/"+ride.id+"/"+method,"POST",next);if(!current())return;await refresh();if(current())alertText("Estado actualizado.");}catch(e){if(current())alertText(e.message,true);}finally{b.disabled=false;}});
      card.append(b);
    }
    if(asDriver){
      if(ride.status==="accepted")action("Iniciar trayecto",{status:"in_progress"},"status");
      if(ride.status==="in_progress"){
        action("Finalizar trayecto",{status:"completed"},"status");
        const gps=document.createElement("button");gps.className="btn secondary";gps.textContent="Enviar posición GPS ahora";
        gps.addEventListener("click",()=>{if(!navigator.geolocation){alertText("GPS no disponible.",true);return;}const epoch=sessionEpoch,driverId=user?.id;navigator.geolocation.getCurrentPosition(async p=>{if(epoch!==sessionEpoch||!user||user.id!==driverId||!canShareGps(ride.id))return;try{await api("/api/rides/"+ride.id+"/location","POST",{position:{lat:p.coords.latitude,lng:p.coords.longitude},accuracy_m:p.coords.accuracy});if(epoch===sessionEpoch&&user?.id===driverId)alertText("Posición enviada voluntariamente al pasajero asignado.");}catch(e){if(epoch===sessionEpoch&&user?.id===driverId)alertText(e.message,true);}},()=>{if(epoch===sessionEpoch&&user?.id===driverId)alertText("Sin permiso GPS.",true);},{enableHighAccuracy:true,timeout:12000});});
        card.append(gps);
        const shareButton=document.createElement("button");shareButton.type="button";shareButton.className="btn secondary";shareButton.dataset.gpsShare=ride.id;
        shareButton.addEventListener("click",()=>{if(gpsShare?.rideId===ride.id){stopGpsShare();alertText("GPS compartido detenido. La última posición enviada puede seguir visible brevemente.");}else{startGpsShare(ride.id);if(gpsShare)alertText("GPS compartido con el pasajero asignado mientras esta pantalla esté abierta.");}});
        card.append(shareButton);
      }
    }else if(["requested","accepted","in_progress"].includes(ride.status)){
      if(ride.status!=="in_progress")action("Cancelar pedido",{status:"cancelled"},"status");
      if(["accepted","in_progress"].includes(ride.status)){
        const view=document.createElement("button");view.className="btn secondary";view.textContent="Consultar GPS del conductor";
        view.addEventListener("click",async()=>{clearDriverLocation();const epoch=sessionEpoch,viewerId=user?.id,generation=driverLocationGeneration;const current=()=>epoch===sessionEpoch&&user?.id===viewerId&&generation===driverLocationGeneration&&tab==="passenger";try{const d=await api("/api/rides/"+ride.id+"/location");if(!current())return;if(!myRides.some(x=>x.id===ride.id&&["accepted","in_progress"].includes(x.status)))return;if(displayDriverLocation(ride.id,d.position))alertText("Última posición reciente compartida por el conductor. Se oculta al vencer su vigencia.");else alertText("El conductor aún no compartió una posición reciente.");}catch(e){if(current())alertText(e.message,true);}});
        card.append(view);
      }
    }
    return card;
  }
  const show=(id,cards,empty)=>{
    const host=$(id);host.replaceChildren();if(!cards.length){host.textContent=empty;return;}cards.forEach(x=>host.appendChild(x));
  };
  async function refreshWithFeedback(){
    const epoch=sessionEpoch;
    try{await refresh();}catch(e){if(epoch===sessionEpoch&&user)alertText(e.message,true);}
  }
  async function refresh(){
    if(!user)return;
    const epoch=sessionEpoch, generation=++refreshGeneration;
    const r=await api("/api/rides/mine");
    if(epoch!==sessionEpoch||generation!==refreshGeneration||!user)return; // No restaurar viajes de una sesión cerrada.
    myRides=r.rides||[];
    if(gpsShare&&!canShareGps(gpsShare.rideId))stopGpsShare();
    if(driverMarkerRide&&!myRides.some(x=>x.id===driverMarkerRide&&["accepted","in_progress"].includes(x.status)))clearDriverLocation();
    show("my-rides",myRides.filter(x=>x.rider_id===user.id || !x.rider_id&&x.driver_id!==user.id).map(x=>rideCard(x,false)),"Todavía no tenés viajes.");
    show("driver-current",myRides.filter(x=>x.driver_id===user.id).map(x=>rideCard(x,true)),"Todavía no hay viajes asignados.");
    syncGpsButtons();
    if(user.driver_status==="approved"&&live){
      const open=await api("/api/rides/open");
      if(epoch!==sessionEpoch||generation!==refreshGeneration||!user)return;
      const cards=(open.rides||[]).map(ride=>{
        const el=document.createElement("div");el.className="trip";
        const name=document.createElement("strong");name.textContent="Solicitud "+ride.id.slice(0,8);
        const details=document.createElement("small");details.textContent="Aprox. "+ride.distance_air_km+" km en línea recta. No incluye tarifa.";
        const button=document.createElement("button");button.className="btn";button.textContent="Aceptar solicitud";button.disabled=acceptPending.has(ride.id);
        button.addEventListener("click",async()=>{if(!user||!live||button.disabled||acceptPending.has(ride.id))return;const epoch=sessionEpoch;const current=()=>epoch===sessionEpoch&&!!user;const pending=acceptPending;pending.add(ride.id);button.disabled=true;try{await api("/api/rides/"+ride.id+"/accept","POST",{});if(!current())return;await refresh();if(current())alertText("Viaje asignado.");}catch(e){if(current())alertText(e.message,true);}finally{pending.delete(ride.id);if(current())button.disabled=false;}});
        el.append(name,details,button);return el;
      });
      show("available-rides",cards,"No hay solicitudes abiertas.");
    }else $("available-rides").textContent="Solo visible con conductor verificado y servicio habilitado.";
  }
  $("refresh").addEventListener("click",()=>refreshWithFeedback());
  $("request-ride").addEventListener("click",async()=>{
    if(!user||!live||requestPending||!coords.origin||!coords.destination)return;
    const epoch=sessionEpoch;
    const current=()=>epoch===sessionEpoch&&!!user;
    requestPending=true;redraw();
    try{await api("/api/rides","POST",{origin:coords.origin,destination:coords.destination});if(!current())return;await refresh();if(current())alertText("Solicitud enviada al servidor del piloto.");}
    catch(e){if(current())alertText(e.message,true);}finally{if(current()){requestPending=false;redraw();}}
  });
  $("driver-apply").addEventListener("click",async()=>{
    const button=$("driver-apply");
    if(!user||button.disabled)return;
    button.disabled=true;
    const epoch=sessionEpoch;
    try{await api("/api/driver/apply","POST",{accept_review:true});if(epoch!==sessionEpoch||!user)return;const r=await api("/api/me");if(epoch!==sessionEpoch||!user)return;setUser(r.user);alertText("Solicitud de revisión registrada. No habilita viajes por sí sola.");}
    catch(e){if(epoch===sessionEpoch&&user)alertText(e.message,true);}
    finally{if(epoch===sessionEpoch&&user)button.disabled=user.driver_status==="approved"||user.driver_status==="pending";}
  });
  function switchTab(next){
    stopGpsShare();
    clearDriverLocation();
    tab=next;const pax=next==="passenger";
    $("passenger-panel").hidden=!pax;$("driver-panel").hidden=pax;
    $("tab-passenger").setAttribute("aria-pressed",String(pax));$("tab-driver").setAttribute("aria-pressed",String(!pax));
    $("tab-passenger").className="btn "+(pax?"dark":"secondary");
    $("tab-driver").className="btn "+(!pax?"dark":"secondary");
    setTimeout(()=>map?.invalidateSize(),50);
  }
  $("tab-passenger").addEventListener("click",()=>switchTab("passenger"));
  $("tab-driver").addEventListener("click",()=>switchTab("driver"));
  // A verification code belongs to the email for which it was requested.
  $("email").addEventListener("input",()=>{
    authGeneration++;
    $("code-section").hidden=true;
    $("access-code").value="";
  });
  $("send-code").addEventListener("click",async()=>{
    const button=$("send-code");
    if(button.disabled||user||$("verify-code").disabled)return;
    const epoch=sessionEpoch,generation=authGeneration;
    const email=$("email").value.trim();
    const current=()=>epoch===sessionEpoch&&generation===authGeneration&&!user&&$("email").value.trim()===email;
    button.disabled=true;
    $("code-section").hidden=true;
    $("access-code").value="";
    try{
      if(!email)throw Error("Ingresá el correo.");
      await api("/api/auth/start","POST",{email});
      if(!current())return;
      $("code-section").hidden=false;alertText("Si el correo está habilitado, recibirá un código de 6 dígitos.");
    }catch(e){if(current())alertText(e.message,true);}finally{button.disabled=!BASE;}
  });
  $("verify-code").addEventListener("click",async()=>{
    const button=$("verify-code");
    if(button.disabled||user||$("send-code").disabled||$("code-section").hidden)return;
    const epoch=sessionEpoch,generation=authGeneration;
    const email=$("email").value.trim(),code=$("access-code").value.trim();
    const current=()=>epoch===sessionEpoch&&generation===authGeneration&&!user&&$("email").value.trim()===email&&$("access-code").value.trim()===code;
    button.disabled=true;
    try{
      const r=await api("/api/auth/verify","POST",{email,code});
      if(!current())return;
      token=r.token;sessionStorage.setItem("bm-viajes-pilot-token",token);
      $("access-code").value="";setUser(r.user);alertText("Acceso verificado.");
    }catch(e){if(current())alertText(e.message,true);}
    finally{button.disabled=false;}
  });
  $("signout").addEventListener("click",async()=>{
    const button=$("signout");button.disabled=true;
    // Iniciar revocación con el token actual, pero limpiar la pantalla sin esperar a la red.
    const revoke=api("/api/auth/logout","POST");
    sessionEpoch++; // Invalidar respuestas de consultas y GPS pendientes.
    token="";sessionStorage.removeItem("bm-viajes-pilot-token");
    // Do not expose the previous account or its authentication code on a shared device.
    $("email").value="";$("access-code").value="";$("code-section").hidden=true;
    switchTab("passenger");
    coords={origin:null,destination:null};myRides=[];pick=null;redraw();map?.setView(center,14);setUser(null);
    const logoutEpoch=sessionEpoch;
    alertText("Sesión cerrada en este dispositivo. Confirmando revocación en el servidor.");
    try{
      await revoke;
      if(logoutEpoch===sessionEpoch&&!user)alertText("Sesión cerrada y revocada en el servidor.");
    }catch(e){
      if(logoutEpoch===sessionEpoch&&!user)alertText("Sesión local cerrada. No se pudo confirmar la revocación en el servidor; evitá reutilizar esta sesión en otro dispositivo.",true);
    }finally{button.disabled=false;}
  });
  async function boot(){
    if(!BASE){serverStatus("La API de Cloudflare todavía no está configurada. Esta pantalla no permite registrarse ni pedir viajes; usá la demo pública.","");$("pilot-api-mode").textContent="Por configurar";return;}
    try{
      const r=await api("/api/config");
      live=!!r.live_rides_enabled;$("pilot-api-mode").textContent=live?"Piloto habilitado":"Solo pruebas";
      serverStatus(live?"Servidor disponible para el piloto de conductores verificados. Sin pagos integrados.":"Servidor conectado, viajes reales deshabilitados hasta aprobar seguridad y documentación.","success");
      // Restore the saved session before allowing a new authentication attempt.
      if(token){
        const epoch=sessionEpoch;
        try{const data=await api("/api/me");if(epoch===sessionEpoch&&!user)setUser(data.user);}
        catch(e){if(epoch===sessionEpoch&&!user){token="";sessionStorage.removeItem("bm-viajes-pilot-token");}}
      }
      $("send-code").disabled=false;
      redraw();
    }catch(e){serverStatus("No se pudo conectar al servidor: "+e.message,"error");}
  }
  boot();
})();
