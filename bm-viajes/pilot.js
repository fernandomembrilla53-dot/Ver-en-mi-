/* BM Viajes - cliente de piloto. Sin API configurada no opera viajes. */
(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const BASE=String(window.BM_VIAJES_API_URL||"").trim().replace(/\/$/,"");
  const center=[-37.1515,-58.4859];
  let token=sessionStorage.getItem("bm-viajes-pilot-token")||"";
  let user=null,live=false,map=null,pick=null,markers={},line=null,coords={origin:null,destination:null},myRides=[],tab="passenger";
  let refreshTimer=null,sessionEpoch=0;
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
      refresh().catch(e=>alertText(e.message,true));
    }else{
      if(refreshTimer)clearInterval(refreshTimer);refreshTimer=null;
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
    $("request-ride").disabled=!(live&&coords.origin&&coords.destination);
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
  $("set-pickup").addEventListener("click",()=>{pick="origin";redraw();alertText("Tocá un punto en el mapa para marcar el origen A.");});
  $("set-dropoff").addEventListener("click",()=>{pick="destination";redraw();alertText("Tocá un punto en el mapa para marcar el destino B.");});
  $("gps-pickup").addEventListener("click",()=>{
    if(!user){alertText("Iniciá sesión antes de utilizar el GPS del piloto.",true);return;}
    if(!navigator.geolocation){alertText("GPS no disponible.",true);return;}
    const epoch=sessionEpoch;
    navigator.geolocation.getCurrentPosition(p=>{
      if(epoch!==sessionEpoch||!user)return; // Ignorar GPS pendiente tras cerrar sesión o cambiar de usuario.
      setPoint("origin",{lat:p.coords.latitude,lng:p.coords.longitude});map?.setView([p.coords.latitude,p.coords.longitude],16);
      alertText("Tu ubicación quedó marcada solo en esta sesión, hasta que elijas enviar un viaje.");
    },()=>{
      if(epoch===sessionEpoch&&user)alertText("No se obtuvo permiso de GPS. Podés señalar el lugar en el mapa.",true);
    },{enableHighAccuracy:true,timeout:15000,maximumAge:10000});
  });
  function rideCard(ride,asDriver){
    const card=document.createElement("div");card.className="trip";
    const strong=document.createElement("strong");strong.textContent="Viaje "+ride.id.slice(0,8)+" · "+ride.status;
    const detail=document.createElement("small");detail.textContent=new Date(ride.created_at).toLocaleString("es-AR");
    card.append(strong,detail);
    function action(label,next,method){
      const b=document.createElement("button");b.type="button";b.className="btn secondary";b.textContent=label;
      b.addEventListener("click",async()=>{b.disabled=true;try{await api("/api/rides/"+ride.id+"/"+method,"POST",next);await refresh();alertText("Estado actualizado.");}catch(e){alertText(e.message,true);}finally{b.disabled=false;}});
      card.append(b);
    }
    if(asDriver){
      if(ride.status==="accepted")action("Iniciar trayecto",{status:"in_progress"},"status");
      if(ride.status==="in_progress"){
        action("Finalizar trayecto",{status:"completed"},"status");
        const gps=document.createElement("button");gps.className="btn secondary";gps.textContent="Enviar posición GPS ahora";
        gps.addEventListener("click",()=>{if(!navigator.geolocation){alertText("GPS no disponible.",true);return;}const epoch=sessionEpoch,driverId=user?.id;navigator.geolocation.getCurrentPosition(async p=>{if(epoch!==sessionEpoch||!user||user.id!==driverId)return;try{await api("/api/rides/"+ride.id+"/location","POST",{position:{lat:p.coords.latitude,lng:p.coords.longitude},accuracy_m:p.coords.accuracy});if(epoch===sessionEpoch&&user?.id===driverId)alertText("Posición enviada voluntariamente al pasajero asignado.");}catch(e){if(epoch===sessionEpoch&&user?.id===driverId)alertText(e.message,true);}},()=>{if(epoch===sessionEpoch&&user?.id===driverId)alertText("Sin permiso GPS.",true);},{enableHighAccuracy:true,timeout:12000});});
        card.append(gps);
      }
    }else if(["requested","accepted"].includes(ride.status)){
      action("Cancelar pedido",{status:"cancelled"},"status");
      if(ride.status==="accepted"){
        const view=document.createElement("button");view.className="btn secondary";view.textContent="Consultar GPS del conductor";
        view.addEventListener("click",async()=>{try{const d=await api("/api/rides/"+ride.id+"/location");if(d.position&&map){map.setView([d.position.lat,d.position.lng],16);alertText("Posición reciente del conductor (con su autorización).");}else alertText("El conductor aún no compartió una posición reciente.");}catch(e){alertText(e.message,true);}});
        card.append(view);
      }
    }
    return card;
  }
  const show=(id,cards,empty)=>{
    const host=$(id);host.replaceChildren();if(!cards.length){host.textContent=empty;return;}cards.forEach(x=>host.appendChild(x));
  };
  async function refresh(){
    if(!user)return;
    const epoch=sessionEpoch;
    const r=await api("/api/rides/mine");
    if(epoch!==sessionEpoch||!user)return; // No restaurar viajes de una sesión cerrada.
    myRides=r.rides||[];
    show("my-rides",myRides.filter(x=>x.rider_id===user.id || !x.rider_id&&x.driver_id!==user.id).map(x=>rideCard(x,false)),"Todavía no tenés viajes.");
    show("driver-current",myRides.filter(x=>x.driver_id===user.id).map(x=>rideCard(x,true)),"Todavía no hay viajes asignados.");
    if(user.driver_status==="approved"&&live){
      const open=await api("/api/rides/open");
      if(epoch!==sessionEpoch||!user)return;
      const cards=(open.rides||[]).map(ride=>{
        const el=document.createElement("div");el.className="trip";
        const name=document.createElement("strong");name.textContent="Solicitud "+ride.id.slice(0,8);
        const details=document.createElement("small");details.textContent="Aprox. "+ride.distance_air_km+" km en línea recta. No incluye tarifa.";
        const button=document.createElement("button");button.className="btn";button.textContent="Aceptar solicitud";
        button.addEventListener("click",async()=>{button.disabled=true;try{await api("/api/rides/"+ride.id+"/accept","POST",{});await refresh();alertText("Viaje asignado.");}catch(e){alertText(e.message,true);}finally{button.disabled=false;}});
        el.append(name,details,button);return el;
      });
      show("available-rides",cards,"No hay solicitudes abiertas.");
    }else $("available-rides").textContent="Solo visible con conductor verificado y servicio habilitado.";
  }
  $("refresh").addEventListener("click",()=>refresh().catch(e=>alertText(e.message,true)));
  $("request-ride").addEventListener("click",async()=>{
    if(!live||!coords.origin||!coords.destination)return;
    $("request-ride").disabled=true;
    try{await api("/api/rides","POST",{origin:coords.origin,destination:coords.destination});await refresh();alertText("Solicitud enviada al servidor del piloto.");}
    catch(e){alertText(e.message,true);}finally{redraw();}
  });
  $("driver-apply").addEventListener("click",async()=>{
    try{await api("/api/driver/apply","POST",{accept_review:true});const r=await api("/api/me");setUser(r.user);alertText("Solicitud de revisión registrada. No habilita viajes por sí sola.");}
    catch(e){alertText(e.message,true);}
  });
  function switchTab(next){
    tab=next;const pax=next==="passenger";
    $("passenger-panel").hidden=!pax;$("driver-panel").hidden=pax;
    $("tab-passenger").setAttribute("aria-pressed",String(pax));$("tab-driver").setAttribute("aria-pressed",String(!pax));
    $("tab-passenger").className="btn "+(pax?"dark":"secondary");
    $("tab-driver").className="btn "+(!pax?"dark":"secondary");
    setTimeout(()=>map?.invalidateSize(),50);
  }
  $("tab-passenger").addEventListener("click",()=>switchTab("passenger"));
  $("tab-driver").addEventListener("click",()=>switchTab("driver"));
  $("send-code").addEventListener("click",async()=>{
    try{
      const email=$("email").value.trim();if(!email)throw Error("Ingresá el correo.");
      $("send-code").disabled=true;await api("/api/auth/start","POST",{email});
      $("code-section").hidden=false;alertText("Si el correo está habilitado, recibirá un código de 6 dígitos.");
    }catch(e){alertText(e.message,true);}finally{$("send-code").disabled=!BASE;}
  });
  $("verify-code").addEventListener("click",async()=>{
    try{
      const email=$("email").value.trim(),code=$("access-code").value.trim();
      const r=await api("/api/auth/verify","POST",{email,code});
      token=r.token;sessionStorage.setItem("bm-viajes-pilot-token",token);
      $("access-code").value="";setUser(r.user);alertText("Acceso verificado.");
    }catch(e){alertText(e.message,true);}
  });
  $("signout").addEventListener("click",async()=>{
     const button=$("signout");button.disabled=true;
     let revoked=false;
     try{await api("/api/auth/logout","POST");revoked=true;}
     catch(e){alertText("No se pudo confirmar el cierre en el servidor. Cerramos esta pestaña; evitá compartir este dispositivo y volvé a intentarlo si tenés conexión.",true);}
     finally{
       sessionEpoch++; // Invalidar consultas en vuelo antes de limpiar datos privados.
       token="";sessionStorage.removeItem("bm-viajes-pilot-token");
       coords={origin:null,destination:null};myRides=[];pick=null;redraw();setUser(null);button.disabled=false;
       if(revoked)alertText("Sesión cerrada y revocada en el servidor.");
     }
   });
  async function boot(){
    if(!BASE){serverStatus("La API de Cloudflare todavía no está configurada. Esta pantalla no permite registrarse ni pedir viajes; usá la demo pública.","");$("pilot-api-mode").textContent="Por configurar";return;}
    try{
      const r=await api("/api/config");
      live=!!r.live_rides_enabled;$("pilot-api-mode").textContent=live?"Piloto habilitado":"Solo pruebas";
      serverStatus(live?"Servidor disponible para el piloto de conductores verificados. Sin pagos integrados.":"Servidor conectado, viajes reales deshabilitados hasta aprobar seguridad y documentación.","success");
      $("send-code").disabled=false;
      if(token){try{const data=await api("/api/me");setUser(data.user);}catch(e){token="";sessionStorage.removeItem("bm-viajes-pilot-token");}}
      redraw();
    }catch(e){serverStatus("No se pudo conectar al servidor: "+e.message,"error");}
  }
  boot();
})();
