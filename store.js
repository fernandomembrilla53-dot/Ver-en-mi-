/* Pedidos por WhatsApp: la persona revisa y envía el mensaje desde WhatsApp. */
(() => {
"use strict";
const mount = document.getElementById("vemProductosMount");
if (!mount) return;
const destination = String(window.VEM_ORDER_WHATSAPP || "").replace(/\D/g,"");
const apiBase = String(window.VEM_STORE_API || "").replace(/\/$/,"");
const money = n => new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(n);
const preview = document.createElement("div");
preview.className = "shop-photo-preview";
const heading = document.createElement("div");
heading.className = "shop-photo-preview-head";
const headingTitle = document.createElement("h3");
headingTitle.textContent = "Elegí el producto que te gusta";
const headingNote = document.createElement("p");
headingNote.textContent = "Seleccioná una foto para escribir tu pedido. El precio y la disponibilidad se confirman por WhatsApp.";
heading.append(headingTitle,headingNote);
const grid = document.createElement("div");
grid.className = "shop-preview-grid";
preview.append(heading,grid);
mount.append(preview);
const live = document.createElement("div");
live.className = "shop-live-products";
mount.append(live);
const dialog = document.createElement("dialog");
dialog.className = "shop-order-dialog";
dialog.setAttribute("aria-labelledby","vem-order-title");
dialog.innerHTML = '<div class="shop-order-top"><h2 id="vem-order-title">Tu pedido</h2><button type="button" class="shop-order-close" aria-label="Cerrar">×</button></div><p class="shop-order-welcome">Gracias por elegirnos 😊❤️, dejame tu número de teléfono así te contesto.</p>'+
'<div class="shop-order-choice"><img id="vem-order-preview" alt="Foto del producto elegido"><div><strong id="vem-order-selected"></strong><p id="vem-order-price">Consultá precio y disponibilidad</p></div></div>'+
'<form id="vem-order-form">'+
'<label for="vem-order-name">Tu nombre (opcional)</label><input id="vem-order-name" name="nombre" type="text" autocomplete="name" maxlength="80" placeholder="¿Cómo te llamás?">'+
'<label for="vem-order-phone">Tu número de WhatsApp</label><input id="vem-order-phone" name="telefono" type="tel" inputmode="tel" autocomplete="tel" maxlength="24" required placeholder="Ej.: 2494 123456">'+
'<p class="shop-order-help">Incluí el código de área para que podamos responderte.</p>'+
'<label for="vem-order-qty">Cantidad</label><input id="vem-order-qty" name="cantidad" type="number" min="1" max="20" value="1" required>'+
'<label for="vem-order-delivery">¿Cómo lo querés recibir?</label><select id="vem-order-delivery" name="entrega"><option value="A coordinar">A coordinar</option><option value="Retiro">Retiro</option><option value="Envío">Envío</option></select>'+
'<label for="vem-order-notes">Aclaración (opcional)</label><textarea id="vem-order-notes" name="aclaracion" rows="2" maxlength="240" placeholder="Por ejemplo, para qué día lo necesitás"></textarea>'+
'<p class="shop-order-notice">Al tocar Enviar por WhatsApp se abrirá el chat del comercio con el pedido preparado. Tocá Enviar dentro de WhatsApp para que se entregue.</p>'+
'<p id="vem-order-error" role="alert" class="shop-order-error" hidden></p>'+
'<button type="submit" class="shop-order-submit">Enviar por WhatsApp</button></form>';
document.body.append(dialog);
const form = dialog.querySelector("#vem-order-form");
const errorBox = dialog.querySelector("#vem-order-error");
let chosen = null;
function openOrder(product) {
 chosen = product;
 form.reset();
 errorBox.hidden = true;
 errorBox.textContent = "";
 dialog.querySelector("#vem-order-selected").textContent = product.name;
 dialog.querySelector("#vem-order-preview").src = product.photo;
 dialog.querySelector("#vem-order-price").textContent = product.price ? "Precio publicado: "+money(product.price) : "Consultá precio y disponibilidad";
 if (typeof dialog.showModal === "function") dialog.showModal();
 else dialog.setAttribute("open","");
}
dialog.querySelector(".shop-order-close").addEventListener("click",() => dialog.close());
dialog.addEventListener("click",e => {if(e.target===dialog)dialog.close();});
function addTile(container,product) {
 const button = document.createElement("button");
 button.type = "button";
 button.className = "shop-preview-tile";
 button.setAttribute("aria-label","Consultar "+product.name+" por WhatsApp");
 const photo = document.createElement("img");
 photo.className = "shop-preview-image";
 photo.src = product.photo;
 photo.alt = "Fotografía de "+product.name;
 photo.loading = product.index && product.index<=4 ? "eager" : "lazy";
 photo.decoding = "async";
 const caption = document.createElement("span");
 caption.className = "shop-preview-caption";
 caption.textContent = product.name;
 const hint = document.createElement("span");
 hint.className = "shop-preview-action";
 hint.textContent = "Consultar por WhatsApp";
 button.append(photo,caption,hint);
 button.addEventListener("click",() => openOrder(product));
 container.append(button);
}
for (let i=1;i<=16;i++) {
 const code = String(i).padStart(2,"0");
 const url = new URL("./assets/producto-"+code+".jpg",document.baseURI).href;
 addTile(grid,{index:i,code:"FOTO-"+code,name:"Producto "+code,photo:url,price:null});
}
form.addEventListener("submit",e => {
 e.preventDefault();
 if(!chosen || !form.reportValidity()) return;
 const fd = new FormData(form);
 const name = String(fd.get("nombre")||"").trim();
 const phone = String(fd.get("telefono")||"").trim();
 const digits = phone.replace(/\D/g,"");
 const qty = Number(fd.get("cantidad"));
 if(digits.length<8 || digits.length>15) {
  errorBox.textContent="Escribí un número de WhatsApp válido, con código de área.";
  errorBox.hidden=false;
  return;
 }
 if(!Number.isInteger(qty) || qty<1 || qty>20 || destination.length<10 || destination.length>15) {
  errorBox.textContent="No se pudo preparar el pedido. Revisá la cantidad o contactá con el comercio.";
  errorBox.hidden=false;
  return;
 }
 const delivery = String(fd.get("entrega")||"A coordinar");
 const notes = String(fd.get("aclaracion")||"").trim();
 const lines = [
  "Hola, quiero consultar o pedir un producto de Ver en Mi.",
  "",
  "Producto: "+chosen.name,
  "Referencia: "+chosen.code,
  "Foto: "+chosen.photo,
  "Cantidad: "+qty,
  "Nombre: "+(name||"No indicado"),
  "Mi WhatsApp para responderme: "+phone,
  "Entrega: "+delivery
 ];
 if(chosen.price)lines.push("Precio publicado por unidad: "+money(chosen.price));
 if(notes)lines.push("Aclaración: "+notes);
 lines.push("","Por favor, confirmame disponibilidad y precio final. ¡Gracias!");
 dialog.close();
 window.location.assign("https://wa.me/"+destination+"?text="+encodeURIComponent(lines.join("\n")));
});
async function loadPublished() {
 if(!apiBase) return;
 try{
  const response=await fetch(apiBase+"/api/menu",{cache:"no-store"});
  if(!response.ok) return;
  const data=await response.json();
  const products=Array.isArray(data.products) ? data.products.filter(p=>p&&typeof p.name==="string"&&p.name.trim()&&typeof p.photo_url==="string"&&/^https:\/\//.test(p.photo_url)&&Number.isSafeInteger(p.price_ars)&&p.price_ars>0) : [];
  live.replaceChildren();
  if(!products.length) return;
  const title=document.createElement("h3");title.textContent="Productos con precio publicado";
  const list=document.createElement("div");list.className="shop-preview-grid";
  products.forEach(p=>addTile(list,{name:p.name.trim(),code:"CAT-"+String(p.id||"").slice(0,36),photo:p.photo_url,price:p.price_ars}));
  live.append(title,list);
 }catch(_){ /* La galería con fotografías sigue funcionando sin conexión al catálogo. */ }
}
loadPublished();
window.addEventListener("online",loadPublished);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)loadPublished();});
})();
