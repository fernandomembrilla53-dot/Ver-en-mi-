/* Catálogo y carrito para Ver en Mí. Los precios llegan del servidor, nunca de fotos antiguas. */
(() => {
"use strict";
const API=String(window.VEM_STORE_API||"").replace(/\/$/,"");
const money=n=>new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(n);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const section=document.getElementById("comidas");
if(!section)return;
const panel=document.createElement("div");
panel.id="vemTienda";panel.className="vem-shop";panel.hidden=false;
const intro=document.createElement("div");
intro.innerHTML='<div class="shop-featured">VER EN MÍ · LO SIMPLE DE COMER BIEN</div><h2>Productos caseros</h2><p class="muted">Ensaladas frescas y otras preparaciones del día. Fotos reales de nuestras preparaciones. Consultá disponibilidad y precios cuando se publiquen.</p>';
const content=document.createElement("div");
const cartBox=document.createElement("div");cartBox.className="shop-cart";
const gallery=document.createElement("section");
gallery.className="shop-photo-preview";
gallery.setAttribute("aria-label","Galería de fotografías de productos");
gallery.innerHTML='<div class="shop-photo-preview-head"><h3>Galería de productos</h3><p>Fotografías de nuestros productos. Los precios y la disponibilidad se publicarán próximamente.</p></div>';
const tiles=document.createElement("div");tiles.className="shop-preview-grid";
for(let i=0;i<16;i++){
 const tile=document.createElement("figure");tile.className="shop-preview-tile";
 const photo=document.createElement("div");photo.className="shop-preview-image";
 const x=(i%4)*100/3,y=Math.floor(i/4)*100/3;
 photo.style.backgroundPosition=x+"% "+y+"%";
 photo.setAttribute("role","img");photo.setAttribute("aria-label","Fotografía de producto "+(i+1));
 const cap=document.createElement("figcaption");cap.textContent="Producto "+String(i+1).padStart(2,"0");
 tile.append(photo,cap);tiles.append(tile);
}
gallery.append(tiles);
panel.append(intro,gallery,content,cartBox);
const first=section.querySelector(".card");if(first)first.after(panel);else section.prepend(panel);
let products=[],cart=new Map();
const status=(message,isError=false)=>{content.innerHTML='<p class="'+(isError?'shop-error':'muted')+'">'+esc(message)+'</p>';cartBox.hidden=true;};
if(!API){status("El catálogo se está preparando. Todavía no hay productos ni precios publicados.");return;}
const api=(path,opts={})=>fetch(API+path,{cache:"no-store",...opts,headers:{"Content-Type":"application/json",...(opts.headers||{})}}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"No se pudo conectar");return d});
const compare=(a,b)=>Number(b.featured)-Number(a.featured)||(a.category==="Ensaladas"?-1:b.category==="Ensaladas"?1:0)||a.name.localeCompare(b.name,"es");
function draw(){
 content.replaceChildren();const list=document.createElement("div");list.className="shop-grid";
 const sorted=[...products].sort(compare);
 gallery.hidden=sorted.length>0;
 if(!sorted.length){panel.hidden=false;status("Las fotografías ya se pueden explorar. Los nombres, precios y pedidos se habilitarán cuando estén confirmados.");return;}
 panel.hidden=false;
 const title=document.createElement("h3");title.textContent="Ensaladas y especialidades disponibles";content.append(title);
 sorted.forEach(p=>{
  const item=document.createElement("article");item.className="shop-product";
  const img=p.photo_url?document.createElement("img"):document.createElement("div");
  if(p.photo_url){img.src=p.photo_url;img.alt=p.name;img.loading="lazy";img.className="shop-photo";img.onerror=()=>{img.removeAttribute("src");img.alt="Foto pendiente";};}
  else{img.className="shop-no-photo";img.textContent="Foto próximamente";}
  const detail=document.createElement("div");detail.className="shop-detail";
  detail.innerHTML=(p.featured?'<div class="shop-featured">MENÚ DEL DÍA</div>':'')+'<small>'+esc(p.category)+'</small><h3>'+esc(p.name)+'</h3><small>'+esc(p.description||"")+'</small><div class="shop-price">'+money(p.price_ars)+'</div>';
  const button=document.createElement("button");button.type="button";button.textContent="Agregar al pedido";button.onclick=()=>{cart.set(p.id,Math.min(20,(cart.get(p.id)||0)+1));drawCart()};
  detail.append(button);item.append(img,detail);list.append(item);
 });
 content.append(list);cartBox.hidden=false;drawCart();
}
function drawCart(){
 cartBox.replaceChildren();const title=document.createElement("h3");title.textContent="Mi pedido";cartBox.append(title);
 let total=0;for(const [id,qty] of [...cart]){const p=products.find(x=>x.id===id);if(!p){cart.delete(id);continue;}total+=p.price_ars*qty;
 const line=document.createElement("div");line.className="shop-line";
 const label=document.createElement("span");label.textContent=p.name+" · "+money(p.price_ars*qty);
 const qtyBox=document.createElement("span");qtyBox.className="shop-qty";
 for(const [sign,amount] of [["−",-1],["+",1]]){const b=document.createElement("button");b.type="button";b.textContent=sign;b.setAttribute("aria-label",sign==="+"?"Sumar "+p.name:"Quitar "+p.name);b.onclick=()=>{const next=qty+amount;if(next<=0)cart.delete(id);else cart.set(id,Math.min(20,next));drawCart()};qtyBox.append(b)}
 const n=document.createElement("strong");n.textContent=qty;qtyBox.insertBefore(n,qtyBox.lastChild);
 line.append(label,qtyBox);cartBox.append(line);
 }
 if(!total){const empty=document.createElement("p");empty.className="shop-cart-empty";empty.textContent="Elegí lo que querés comprar y aparecerá acá.";cartBox.append(empty);return;}
 const amount=document.createElement("p");amount.innerHTML="<strong>Total estimado: "+money(total)+"</strong>";cartBox.append(amount);
 const form=document.createElement("form");form.innerHTML='<label>Nombre <input name="nombre" required maxlength="100" autocomplete="name"></label><label>Teléfono <input name="telefono" required maxlength="30" type="tel" autocomplete="tel"></label><label>Entrega <select name="entrega"><option value="retiro">Retiro a coordinar</option><option value="envio">Envío a coordinar</option></select></label><label>Dirección (solo si pedís envío) <input name="direccion" maxlength="180"></label><label>Indicaciones (opcional) <textarea name="notas" maxlength="300" rows="2"></textarea></label><button type="submit">Enviar pedido</button><p class="muted">La compra queda solicitada. El comercio confirmará disponibilidad, entrega y pago.</p>';
 const msg=document.createElement("p");msg.setAttribute("role","status");form.append(msg);
 form.onsubmit=async e=>{e.preventDefault();const fd=new FormData(form),button=form.querySelector("button[type=submit]");button.disabled=true;msg.textContent="Enviando…";
 try{const payload={name:fd.get("nombre"),phone:fd.get("telefono"),delivery:fd.get("entrega"),address:fd.get("direccion"),notes:fd.get("notas"),quoted_total_ars:total,items:[...cart].map(([id,quantity])=>({id,quantity}))};
 const result=await api("/api/orders",{method:"POST",body:JSON.stringify(payload)});
 cart.clear();drawCart();const ok=document.createElement("p");ok.className="shop-success";ok.setAttribute("role","status");ok.textContent="Pedido #"+result.order_id+" registrado. Recibirás una confirmación del comercio.";cartBox.append(ok);
 }catch(err){msg.className="shop-error";msg.textContent=err.message;button.disabled=false;}};
 cartBox.append(form);
}
async function reload(){try{const data=await api("/api/menu");products=Array.isArray(data.products)?data.products.filter(p=>typeof p.id==="string"&&typeof p.name==="string"&&p.name.trim()&&typeof p.photo_url==="string"&&p.photo_url&&Number.isSafeInteger(p.price_ars)&&p.price_ars>0):[];draw()}catch(e){panel.hidden=false;status("La tienda no pudo conectarse por ahora. El resto de Ver en Mi sigue disponible.",true);}}
document.getElementById("verProductos")?.addEventListener("click",()=>{document.querySelector('nav [data-tab="comidas"]')?.click();});
reload();window.addEventListener("online",reload);document.addEventListener("visibilitychange",()=>{if(!document.hidden)reload()});window.addEventListener("focus",reload);setInterval(()=>{if(!document.hidden)reload()},120000);
})();
