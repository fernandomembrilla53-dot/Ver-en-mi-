/* Ver en Mi - planificación local y diaria; no requiere conexión ni cuenta. */
(() => {
'use strict';
const el=id=>document.getElementById(id);
const read=(key,fallback)=>{try{const value=JSON.parse(localStorage.getItem(key));return value===null?fallback:value}catch(_){return fallback}};
const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch(_){}};
const safe=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const dateKey=(date)=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
const dayNumber=d=>Math.floor(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000);
const mod=(n,m)=>((n%m)+m)%m;
const formatDate=d=>new Intl.DateTimeFormat('es-AR',{weekday:'long',day:'numeric',month:'long'}).format(d);
const today=()=>new Date();
const breakfasts=[
'Avena cocida con leche o bebida vegetal, banana y canela','Tostadas integrales con huevo revuelto y mandarina',
'Yogur natural con avena y fruta de estación','Pan con queso fresco, tomate y fruta',
'Licuado espeso de banana y leche con tostadas','Tortilla sencilla de huevo y espinaca con pan',
'Pan con pasta de maní o queso untable y pera','Avena remojada con manzana y yogur',
'Tostadas con ricota y fruta de estación','Sándwich pequeño de queso y tomate más fruta',
'Yogur natural con durazno y avena','Huevos revueltos con pan y naranja',
'Pan integral con hummus y rodajas de tomate','Avena con leche, pera y semillas opcionales'
];
const snacks=[
'Fruta de estación y yogur natural','Tostadas con queso o hummus','Leche o yogur con banana',
'Mandarina y un puñado pequeño de maní sin sal, si lo tolerás','Pan con ricota y tomate','Yogur y avena',
'Ensalada de frutas sencilla','Tostada con huevo o queso','Manzana y yogur natural',
'Sándwich chico de queso y tomate','Pera con avena y leche','Fruta y pan con hummus',
'Banana y yogur o leche','Tostadas con queso untable y una fruta'
];
const lunches=[
['Guiso de lentejas, arroz y verduras','Guiso de lentejas, arroz y verduras'],
['Arroz con pollo, zanahoria y arvejas','Arroz con garbanzos, zanahoria y arvejas'],
['Tarta de acelga y huevo con ensalada','Tarta de acelga y huevo con ensalada'],
['Fideos con salsa casera de tomate y carne picada magra','Fideos con salsa casera de tomate y lentejas'],
['Polenta con salsa de tomate, verduras y queso','Polenta con salsa de tomate, verduras y queso'],
['Ensalada tibia de papa, huevo, chauchas y tomate','Ensalada tibia de papa, huevo, chauchas y tomate'],
['Guiso suave de porotos con zapallo y arroz','Guiso suave de porotos con zapallo y arroz'],
['Pollo al horno con batata y ensalada','Hamburguesas de garbanzos al horno con batata y ensalada'],
['Tortilla de zapallitos y ensalada de porotos','Tortilla de zapallitos y ensalada de porotos'],
['Arroz salteado con huevo y verduras','Arroz salteado con huevo y verduras'],
['Sándwich completo de pollo, tomate y hojas verdes','Sándwich completo de hummus, huevo, tomate y hojas verdes'],
['Ñoquis con salsa de tomate y ensalada','Ñoquis con salsa de tomate y ensalada'],
['Pastel de papa con carne y verduras','Pastel de papa con lentejas y verduras'],
['Ensalada de garbanzos, huevo, zanahoria y pan','Ensalada de garbanzos, huevo, zanahoria y pan']
];
const dinners=[
['Tortilla de papa y cebolla con ensalada','Tortilla de papa y cebolla con ensalada'],
['Sopa de verduras con pollo desmenuzado y tostadas','Sopa de verduras con porotos y tostadas'],
['Arroz con brócoli, huevo y queso','Arroz con brócoli, huevo y queso'],
['Hamburguesas caseras de carne con verduras asadas','Hamburguesas caseras de lentejas con verduras asadas'],
['Pizza casera con tomate, queso y verduras','Pizza casera con tomate, queso y verduras'],
['Zapallitos rellenos de arroz y pollo','Zapallitos rellenos de arroz y garbanzos'],
['Fideos con verduras salteadas y huevo','Fideos con verduras salteadas y huevo'],
['Milanesas de pollo al horno con puré mixto','Milanesas de berenjena al horno con puré mixto y hummus'],
['Ensalada de lentejas, tomate, papa y huevo','Ensalada de lentejas, tomate, papa y huevo'],
['Tarta de calabaza, cebolla y queso','Tarta de calabaza, cebolla y queso'],
['Salteado de arroz, verduras y pollo','Salteado de arroz, verduras y porotos'],
['Revuelto de zapallitos con huevo y pan','Revuelto de zapallitos con huevo y pan'],
['Fideos con salsa de tomate, atún y verduras','Fideos con salsa de tomate, garbanzos y verduras'],
['Sopa espesa de verduras, papa y legumbres','Sopa espesa de verduras, papa y legumbres']
];
const routines=[
 {title:'Fuerza de piernas',kind:'fuerza',variants:[
  ['Sentarte y levantarte de una silla: {n} veces, sin impulso.','Elevaciones de talones con apoyo: {n} veces.','Pasos laterales junto a una pared: {min} min cómodos.'],
  ['Sentadillas parciales con apoyo: {n} veces.','Puente de glúteos en el suelo, solo si es cómodo: {n} veces.','Marcha de pie a ritmo suave: {min} min.'],
  ['Sentarte lento y levantarte con apoyo: {n} veces.','Elevaciones de talones: {n} veces.','Pasos hacia atrás cortos con apoyo: {n} por lado.'],
  ['Subir y bajar un escalón bajo y estable con apoyo: {n} veces.','Sentarte y levantarte de una silla: {n} veces.','Paso lateral suave: {min} min.']
 ]},
 {title:'Movilidad y postura',kind:'suave',variants:[
  ['Movilidad suave de hombros: {n} círculos.','Girar el tronco suavemente sentado: {n} veces.','Caminar despacio en casa: {min} min.'],
  ['Abrir y cerrar brazos sin dolor: {n} veces.','Movilidad de tobillos sentado: {n} veces.','Caminar al ritmo de una conversación: {min} min.'],
  ['Mover muñecas y codos con suavidad: {n} veces.','Movilidad de cadera junto a una silla: {n} veces.','Respiración pausada: {min} min.'],
  ['Estirar brazos al frente sin dolor: {n} veces.','Balanceo suave de piernas con apoyo: {n} veces.','Paseo tranquilo: {min} min.']
 ]},
 {title:'Caminata y resistencia cómoda',kind:'cardio',variants:[
  ['Caminar a un ritmo que te deje hablar: {min} min.','Marchar sin impacto en el lugar: {min} min.','Movilidad de hombros: {n} veces.'],
  ['Caminata cómoda por casa o vereda segura: {min} min.','Pasos laterales suaves: {min} min.','Movilidad de tobillos: {n} veces.'],
  ['Caminar con pequeñas pausas: {min} min.','Marcha de brazos relajados: {min} min.','Elevar talones con apoyo: {n} veces.'],
  ['Caminar al aire libre si el entorno lo permite: {min} min.','Pasos cortos hacia adelante y atrás: {min} min.','Mover hombros suave: {n} veces.']
 ]},
 {title:'Fuerza de torso',kind:'fuerza',variants:[
  ['Flexiones contra la pared: {n} veces.','Abrir y cerrar brazos sin peso: {n} veces.','Marcha tranquila: {min} min.'],
  ['Empujar suavemente la pared: {n} veces.','Remo de brazos sin carga, llevando codos atrás: {n} veces.','Movilidad de hombros: {n} veces.'],
  ['Flexiones sobre una pared: {n} veces.','Elevar brazos al frente sin carga: {n} veces.','Paso lateral cómodo: {min} min.'],
  ['Flexiones contra pared con buena postura: {n} veces.','Juntar suavemente omóplatos: {n} veces.','Marcha suave: {min} min.']
 ]},
 {title:'Equilibrio y coordinación',kind:'suave',variants:[
  ['Caminar apoyando talón y punta, junto a una pared: {min} min.','Balanceo lateral con manos sobre silla: {n} veces.','Marcha lenta: {min} min.'],
  ['Mantenerse de pie junto a una silla firme, alternando apoyos: {n} veces.','Pasos al costado con apoyo: {n} veces.','Caminar tranquilo: {min} min.'],
  ['Mover el peso entre ambos pies, con apoyo: {n} veces.','Marchar con manos cerca de una silla: {min} min.','Movilidad de tobillos: {n} veces.'],
  ['Caminar en línea imaginaria cerca de una pared: {min} min.','Paso corto hacia atrás con apoyo: {n} veces.','Respiración tranquila: {min} min.']
 ]},
 {title:'Movimiento que disfrutes',kind:'cardio',variants:[
  ['Bailar a ritmo cómodo sin saltos: {min} min.','Caminar en casa o plaza: {min} min.','Movilidad de brazos: {n} veces.'],
  ['Paseo cómodo por un lugar seguro: {min} min.','Marcha suave en casa: {min} min.','Estirar piernas suavemente sin dolor.'],
  ['Caminar con música a un ritmo conversable: {min} min.','Paso lateral coordinado: {min} min.','Movilidad de hombros: {n} veces.'],
  ['Caminata recreativa: {min} min.','Movimientos suaves de brazos y piernas: {n} veces.','Respirar tranquilo y aflojar tensión.']
 ]},
 {title:'Recuperación activa',kind:'descanso',variants:[
  ['Caminar muy suave si tenés ganas: {min} min.','Movilidad de hombros sin dolor: {n} veces.','Descansar y respirar con tranquilidad.'],
  ['Paseo corto y cómodo: {min} min.','Mover tobillos sentado: {n} veces.','Priorizar sueño, agua y recuperación.'],
  ['Marcha suave opcional: {min} min.','Movilidad de manos y brazos: {n} veces.','Escuchar cómo se siente tu cuerpo.'],
  ['Caminata tranquila opcional: {min} min.','Movilidad general suave: {n} veces.','Elegir descanso completo si lo necesitás.']
 ]}
];
const dayIndex=d=>mod(dayNumber(d),28);
const preferences=()=>{
 const profile=read('vf_perfil',{}), p=read('vf_plan_personalizado',null);
 const veg=p? p.alimentacion==='vegetariana':profile.alimentacion==='Vegetariana';
 const budget=p?p.presupuesto==='ajustado':profile.alimentacion==='Económica';
 return {veg,budget,level:read('vem_nivel',p&&p.actividad||'inicial')};
};
const menuOf=(date,p)=>{
 const idx=dayIndex(date), second=idx>=14?3:0;
 return {
  breakfast:breakfasts[mod(idx,14)],
  lunch:lunches[mod(idx+second,14)][p.veg?1:0],
  snack:snacks[mod(idx*3+Math.floor(idx/14),14)],
  dinner:dinners[mod(idx*5+second,14)][p.veg?1:0]
 };
};
const completeDays=()=>{
 const saved=read('vf_rutina',{});
 return Object.values(saved).filter(v=>Array.isArray(v)&&v.length>=4).length;
};
const stage=()=>Math.min(4,Math.floor(completeDays()/4));
const routineOf=(date,p)=>{
 const t=routines[mod(date.getDay()+6,7)];
 const variant=Math.floor(dayIndex(date)/7);
 const s=stage(), bonus=p.level==='alto'?4:p.level==='medio'?2:0;
 const reps=6+s*2+bonus, minutes=(t.kind==='descanso'?2:3)+Math.min(3,s)+(p.level==='alto'?2:p.level==='medio'?1:0);
 const steps=t.variants[variant].map(x=>x.replaceAll('{n}',String(reps)).replaceAll('{min}',String(minutes)));
 return {title:t.title,kind:t.kind,steps,stage:s,minutes};
};
const mealCard=(label,value)=>'<div class="meal"><span class="pill">'+label+'</span><h3>'+safe(value)+'</h3></div>';
const dateFromKey=key=>{const [y,m,d]=key.split('-').map(Number);return new Date(y,m-1,d)};
function renderMeals(){
 const root=document.querySelector('#comidas > .card');if(!root)return;
 const now=today(),p=preferences(),m=menuOf(now,p);
 root.innerHTML='<div class="eyebrow">PROPUESTA DEL DÍA</div><h2>Comé distinto cada día</h2>'+
  '<p class="muted">'+safe(formatDate(now))+' · Menú '+(dayIndex(now)+1)+' de 28 · '+(p.veg?'Vegetariano':'Variado')+'</p>'+
  mealCard('Desayuno',m.breakfast)+mealCard('Almuerzo',m.lunch)+mealCard('Merienda',m.snack)+mealCard('Cena',m.dinner)+
  '<p class="muted">Son ideas flexibles, no una dieta estricta. Ajustá cantidades según tu apetito y necesidades; podés intercambiar platos. Agua según tu sed y circunstancias.</p>';
 const shopping=document.querySelector('#comidas > .card:nth-child(2) .muted');
 if(shopping)shopping.textContent='Lista orientativa y económica; revisá alergias y necesidades especiales con un profesional. No uses el menú como dieta médica.';
}
function renderRoutine(){
 const now=today(),p=preferences(),r=routineOf(now,p),container=el('rutina');
 if(!container)return;
 const card=container.parentElement;card.querySelector('h2').textContent='Tu rutina de hoy: '+r.title;
 const pill=card.querySelector('.pill');if(pill)pill.textContent=(r.kind==='descanso'?'Descanso activo opcional':'10–25 min orientativos')+' · Nivel '+(r.stage+1)+' de 5';
 let select=el('vemNivel');
 if(!select){
  select=document.createElement('select');select.id='vemNivel';select.setAttribute('aria-label','Elegir intensidad cómoda');
  select.innerHTML='<option value="inicial">Inicial: suave</option><option value="medio">Intermedio: un poco más</option><option value="alto">Activo: más volumen</option>';
  const label=document.createElement('label');label.htmlFor='vemNivel';label.textContent='Elegí una intensidad que te resulte cómoda';
  container.before(label,select);
  select.addEventListener('change',()=>{save('vem_nivel',select.value);renderRoutine();renderHome()});
 }
 select.value=p.level;
 const steps=['Entrada en calor: 3 minutos de marcha y movilidad suave.'].concat(r.steps,['Vuelta a la calma: respiración normal y movimientos suaves.']);
 const completed=read('vf_rutina',{})[dateKey(now)]||[];
 container.innerHTML=steps.map((step,i)=>'<label class="item"><input type="checkbox" value="paso-'+i+'" '+(completed.includes('paso-'+i)?'checked':'')+'><span><strong>'+(i+1)+'. '+safe(step)+'</strong></span></label>').join('');
 container.querySelectorAll('input').forEach(input=>input.addEventListener('change',()=>{
  const data=read('vf_rutina',{});
  data[dateKey(today())]=Array.from(container.querySelectorAll('input:checked'),x=>x.value);
  save('vf_rutina',data);renderHome();
 }));
 const note=card.querySelector('.muted');
 if(note)note.textContent='Avanzás de nivel después de varios días completados, no por el paso del tiempo. Podés reducir intensidad o descansar. Si tenés dolor de pecho, mareos, dificultad para respirar, enfermedad cardiovascular o indicación médica, no hagas la rutina sin evaluación profesional.';
}
function renderWeek(){
 const sec=el('semana');if(!sec)return;
 Array.from(sec.children).filter(node=>node.classList.contains('card')&&node.querySelector('.pill')&&node!==sec.firstElementChild).forEach(node=>node.remove());
 let dynamic=el('vemSemana');if(!dynamic){dynamic=document.createElement('div');dynamic.id='vemSemana';sec.firstElementChild.after(dynamic)}
 const now=today(),start=new Date(now.getFullYear(),now.getMonth(),now.getDate());start.setDate(start.getDate()-mod(start.getDay()+6,7));
 const p=preferences();let html='';
 for(let i=0;i<7;i++){
  const d=new Date(start.getFullYear(),start.getMonth(),start.getDate()+i);
  const m=menuOf(d,p),r=routineOf(d,p),isToday=dateKey(d)===dateKey(now);
  html+='<div class="card '+(isToday?'card-today':'')+'"><span class="pill">'+safe(formatDate(d))+(isToday?' · HOY':'')+'</span>'+
  mealCard('Desayuno',m.breakfast)+mealCard('Almuerzo',m.lunch)+mealCard('Merienda',m.snack)+mealCard('Cena',m.dinner)+
  '<p class="muted"><strong>Movimiento:</strong> '+safe(r.title)+(r.kind==='descanso'?' (opcional)':'')+'</p></div>';
 }
 dynamic.innerHTML=html;
 const a=el('avisoPlan');if(a)a.textContent=(p.veg?'Menú vegetariano':'Menú variado')+' · Rotación automática de 28 días';
}
function renderHome(){
 const sec=el('inicio');if(!sec)return;
 let card=el('vemHoy');if(!card){card=document.createElement('div');card.id='vemHoy';card.className='card spotlight';sec.prepend(card)}
 const now=today(),p=preferences(),m=menuOf(now,p),r=routineOf(now,p),done=read('vf_habitos',{})[dateKey(now)]||[];
 card.innerHTML='<div class="eyebrow">HOY · '+safe(formatDate(now))+'</div>'+
  '<h2>Un día mejor, a tu ritmo</h2><div class="daily-stats"><div><strong>'+done.length+'/4</strong><small>Hábitos de hoy</small></div><div><strong>'+(r.stage+1)+'/5</strong><small>Nivel de movimiento</small></div><div><strong>'+(dayIndex(now)+1)+'/28</strong><small>Menú del ciclo</small></div></div>'+
  '<p><strong>Almuerzo:</strong> '+safe(m.lunch)+'</p><p><strong>Movimiento:</strong> '+safe(r.title)+'</p>'+
  '<div class="quick-actions"><button type="button" data-go="comidas">Ver comidas</button><button type="button" data-go="ejercicio">Ver rutina</button></div>'+
  '<p class="muted">Se actualiza cada día, incluso sin conexión. Tus datos permanecen en este dispositivo.</p>';
 card.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>{const nav=document.querySelector('nav button[data-tab="'+b.dataset.go+'"]');if(nav)nav.click()}));
}
function renderMyPlan(){
 const out=el('resultadoPlan'),p=read('vf_plan_personalizado',null);if(!out||!p||!p.edad)return;
 const m=menuOf(today(),preferences()),r=routineOf(today(),preferences());
 out.innerHTML='<div class="eyebrow">TUS PREFERENCIAS GUARDADAS</div><h2>Tu propuesta para hoy</h2>'+
  '<p class="muted">'+safe(formatDate(today()))+' · Se renueva automáticamente cada día</p>'+
  mealCard('Desayuno',m.breakfast)+mealCard('Almuerzo',m.lunch)+mealCard('Merienda',m.snack)+mealCard('Cena',m.dinner)+
  '<h3>Movimiento recomendado</h3><p>'+safe(r.title)+' · '+(r.kind==='descanso'?'Recuperación opcional':'Empezá suavemente y descansá si lo necesitás')+'</p>'+
  '<p class="muted">Son sugerencias generales, no indicaciones personalizadas de salud, calorías o tratamiento. Consultá si tenés alergias, enfermedades, embarazo o restricciones.</p>';
 out.classList.remove('hidden');
}
function storeMyPlan(){
 const age=Number(el('ppEdad').value);
 if(!Number.isInteger(age)||age<18||age>100){alert('Ingresá una edad válida entre 18 y 100 años.');return}
 const data={edad:String(age),objetivo:el('ppObjetivo').value,alimentacion:el('ppAlimentacion').value,presupuesto:el('ppPresupuesto').value,actividad:el('ppActividad').value};
 save('vf_plan_personalizado',data);save('vem_nivel',data.actividad);
 renderAll();renderMyPlan();
}
function enhanceProgress(){
 const history=el('historial');if(!history)return;
 const section=el('progreso'),card=section.querySelector('.card:nth-child(2)');
 if(!el('vemExport')){
  const button=document.createElement('button');button.id='vemExport';button.className='secondary';button.type='button';button.textContent='Exportar mis datos';
  button.addEventListener('click',()=>{
   const data={perfil:read('vf_perfil',{}),habitos:read('vf_habitos',{}),rutinas:read('vf_rutina',{}),historial:read('vf_historial',[]),plan:read('vf_plan_personalizado',null)};
   const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ver-en-mi-mis-datos-'+dateKey(today())+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
  });card.append(button);
 }
}
function renderAll(){renderMeals();renderRoutine();renderWeek();renderHome();renderMyPlan()}
function init(){
 const create=el('crearPlan');if(create){create.textContent='Guardar preferencias y ver mi día';create.addEventListener('click',storeMyPlan)}
 const p=read('vf_plan_personalizado',null);
 if(p&&p.edad)renderMyPlan();
 const guardar=el('guardar');if(guardar)guardar.addEventListener('click',()=>{renderAll()});
 const registrar=el('registrar');if(registrar)registrar.addEventListener('click',()=>{renderHome();renderRoutine()});
 const borrar=el('borrar');if(borrar)borrar.addEventListener('click',renderHome);
 document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>{
   if(b.dataset.tab==='progreso'&&typeof window.mostrarHistorial==='function')window.mostrarHistorial();
   if(b.dataset.tab==='personalizado')renderMyPlan();
 }));
 enhanceProgress();renderAll();
 let previous=dateKey(today());const check=()=>{const next=dateKey(today());if(next!==previous){previous=next;renderAll();if(typeof window.cargarHabitos==='function')window.cargarHabitos()}};
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)check()});
 window.addEventListener('focus',check);setInterval(check,60000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
