export async function maps(req,env,user,{json,ApiError}){
 const u=new URL(req.url);if(!['/api/maps/search','/api/maps/route'].includes(u.pathname)||req.method!=='GET')return null;
 const fail=(msg,status=400)=>{throw new ApiError(msg,status);};
 // Global spacing across devices, not a per-browser throttle.
 const lease=await env.DB.prepare("INSERT INTO map_requests VALUES('public',?) ON CONFLICT(id) DO UPDATE SET last_at=excluded.last_at WHERE map_requests.last_at<=excluded.last_at-1100").bind(Date.now()).run();
 if(!lease.meta.changes)fail('Esperá un momento antes de consultar el mapa.',429);
 let target;
 if(u.pathname.endsWith('/search')){
  const q=u.searchParams.get('q');if(!q||q.length<3||q.length>120)fail('Ingresá una dirección de Ayacucho.');
  const key=BufferlessHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(q.toLowerCase())));
  const cached=await env.DB.prepare('SELECT response FROM map_cache WHERE id=? AND expires_at>?').bind(key,Date.now()).first();if(cached)return json({ok:true,places:JSON.parse(cached.response)});
  target=new URL(env.GEOCODER_URL||'https://nominatim.openstreetmap.org/search');target.search=new URLSearchParams({q:q+', Ayacucho, Buenos Aires, Argentina',format:'jsonv2',limit:'5',countrycodes:'ar',viewbox:'-58.65,-37.03,-58.32,-37.28',bounded:'1'}).toString();
  const r=await fetch(target,{headers:{'User-Agent':'BM-Viajes-Pilot/1.0 (https://bm-viajes-api.fernandomembrilla53.workers.dev)'},signal:AbortSignal.timeout(10000)});if(!r.ok)fail('Búsqueda de direcciones no disponible.',503);
  const places=(await r.json()).map(p=>({label:String(p.display_name).slice(0,300),lat:Number(p.lat),lng:Number(p.lon)})).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng));
  await env.DB.prepare('INSERT INTO map_cache VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET response=excluded.response,expires_at=excluded.expires_at').bind(key,JSON.stringify(places),Date.now()+86400000).run();return json({ok:true,places});
 }
 const nums=['alat','alng','blat','blng'].map(k=>{const v=u.searchParams.get(k);return v===null?NaN:Number(v);});
 if(nums.some(x=>!Number.isFinite(x))||[nums[0],nums[2]].some(x=>Math.abs(x+37.1515)>.3)||[nums[1],nums[3]].some(x=>Math.abs(x+58.4859)>.4))fail('Recorrido fuera del área piloto.');
 target=(env.ROUTER_URL||'https://router.project-osrm.org')+'/route/v1/driving/'+nums[1]+','+nums[0]+';'+nums[3]+','+nums[2]+'?overview=full&geometries=geojson';
 const r=await fetch(target,{signal:AbortSignal.timeout(10000)});if(!r.ok)fail('No se pudo calcular el recorrido.',503);const data=await r.json(),route=data.routes?.[0];if(data.code!=='Ok'||!route||!Number.isFinite(route.distance)||!Number.isFinite(route.duration)||route.geometry?.coordinates?.length>10000)fail('Recorrido no disponible.',503);
 return json({ok:true,route:{distance:route.distance,duration:route.duration,geometry:route.geometry}});
}
function BufferlessHex(value){return Array.from(new Uint8Array(value),b=>b.toString(16).padStart(2,'0')).join('');}
