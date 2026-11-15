// Local reproducible browser journey; no live accounts, trips, mail or payments.
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import worker from '../backend/worker.mjs';
import {localD1} from './helpers/local-d1.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const db=localD1(),mailbox=new Map();
const env={DB:db,AUTH_SECRET:'fictitious-offline-browser-key-00000000',BREVO_API_KEY:'fake-key',MAIL_FROM:'test@example.invalid',ENABLE_LIVE_RIDES:'true'};
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{assert.equal(String(url),'https://api.brevo.com/v3/smtp/email');const m=JSON.parse(options.body);assert.match(m.to[0].email,/@example.invalid$/);mailbox.set(m.to[0].email,m.textContent.match(/\d{6}/)[0]);return new Response('{}',{status:201});};
const root=resolve(import.meta.dirname,'..');
const server=createServer(async(req,res)=>{try{
 let body='';for await(const c of req)body+=c;
 if(req.url.startsWith('/api/')){const r=await worker.fetch(new Request(base+req.url,{method:req.method,headers:req.headers,...(body?{body}: {})}),env);res.writeHead(r.status,Object.fromEntries(r.headers));res.end(await r.text());return;}
 if(req.url==='/bm-viajes/config.js'){res.setHeader('Content-Type','application/javascript');res.end('window.BM_VIAJES_API_URL='+JSON.stringify(base));return;}
 const p=resolve(root,decodeURIComponent(req.url.split('?')[0].replace(/^\/bm-viajes\//,'')));if(!p.startsWith(root+'/')||!existsSync(p)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[extname(p)]||'text/plain');res.end(readFileSync(p));
}catch{res.writeHead(500);res.end('Local test error');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;env.FRONTEND_ORIGIN=base;
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 const contexts=await Promise.all([1,2].map(()=>browser.newContext({viewport:{width:390,height:844},geolocation:{latitude:-37.1515,longitude:-58.4859,accuracy:10},permissions:['geolocation']})));
 const pages=await Promise.all(contexts.map(c=>c.newPage()));
 // Isolate the flow from tile/CDN availability. Map integration is separately tested.
 const leaflet=`window.L={map:()=>({setView(){return this},on(n,f){if(n==='click')window.mapTestClick=f;return this},invalidateSize(){},removeLayer(){},fitBounds(){}}),tileLayer:()=>({addTo(){return this}}),marker:()=>({addTo(){return this},bindPopup(){return this},setLatLng(){return this}}),polyline:()=>({addTo(){return this},getBounds(){return []}})};`;
 for(const p of pages){await p.route('https://**/*',route=>route.request().url().endsWith('leaflet.js')?route.fulfill({contentType:'application/javascript',body:leaflet}):route.abort());
 // The fixture serves a controlled dependency; remove SRI only in this local test response.
 await p.route(base+'/bm-viajes/piloto.html',route=>route.fulfill({contentType:'text/html',body:readFileSync(root+'/piloto.html','utf8').replace(/ integrity="[^"]*"/g,'')}));}
 const [passenger,driver]=pages;
 async function login(p,name){await p.goto(base+'/bm-viajes/piloto.html');await p.locator('#email').fill(name+'@example.invalid');await p.locator('#send-code').click();await p.locator('#code-section').waitFor({state:'visible'});await p.locator('#access-code').fill(mailbox.get(name+'@example.invalid'));await p.locator('#verify-code').click();await p.locator('#user-area').waitFor({state:'visible'});}
 await login(passenger,'passenger');await login(driver,'driver');
 const d=await db.prepare("SELECT id FROM users WHERE email='driver@example.invalid'").first();
 // Approved identity fixture; actual encrypted review is covered by operations.test.mjs.
 await db.prepare("UPDATE users SET driver_status='approved' WHERE id=?").bind(d.id).run();
 await driver.reload();await driver.locator('#user-area').waitFor({state:'visible'});await driver.locator('#tab-driver').click();await driver.locator('#availability').click();await driver.getByText('Disponible · ubicación actualizada',{exact:true}).waitFor();
 await passenger.locator('#set-pickup').click();await passenger.evaluate(()=>window.mapTestClick({latlng:{lat:-37.1515,lng:-58.4859}}));
 await passenger.locator('#set-dropoff').click();await passenger.evaluate(()=>window.mapTestClick({latlng:{lat:-37.16,lng:-58.49}}));passenger.on('dialog',d=>d.accept());
 await passenger.locator('#request-ride').click();await passenger.getByText('Solicitud enviada al servidor del piloto.',{exact:true}).waitFor();
 await driver.locator('#refresh').click();await driver.getByRole('button',{name:'Aceptar solicitud',exact:true}).click();await driver.getByRole('button',{name:'Iniciar trayecto',exact:true}).click();
 await driver.getByRole('button',{name:'Enviar posición GPS ahora',exact:true}).click();await driver.getByText('Posición enviada voluntariamente al pasajero asignado.',{exact:true}).waitFor();
 await driver.getByRole('button',{name:'Finalizar trayecto',exact:true}).click();await driver.getByRole('button',{name:'Confirmar efectivo recibido',exact:true}).click();
 await passenger.locator('#refresh').click();await passenger.getByRole('button',{name:'Confirmar efectivo entregado',exact:true}).click();await passenger.getByRole('button',{name:'Guardar calificación',exact:true}).click();await passenger.getByText('Calificación guardada.',{exact:true}).waitFor();
 const counts=await db.prepare('SELECT (SELECT COUNT(*) FROM cash_confirmations) cash,(SELECT COUNT(*) FROM driver_ledger) ledger,(SELECT COUNT(*) FROM ride_ratings) rating').first();assert.deepEqual({...counts},{cash:2,ledger:1,rating:1});
 for(const p of pages)assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile overflow');
 console.log('PASS: two isolated mobile browser sessions, OTP, approval fixture, availability, request with server quote, acceptance, GPS fixture, completion, dual cash confirmation, commission and rating.');
}finally{await browser?.close();await new Promise(r=>server.close(r));db.close();globalThis.fetch=nativeFetch;}
