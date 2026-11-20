import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const html=source("conductores.html");
const js=source("conductores.js");

test("panel independiente de inscripción de conductores: HTML, controles y rutas",()=>{
  for(const id of ["server-status","login","email-form","code-form","account","profile-form","document-form","document-status","accept-privacy","accept-review","request-review","logout","feedback"])
    assert.match(html,new RegExp('id="'+id+'"'),"Missing element: "+id);
  for(const kind of ["identity","license","permit","insurance","vtv"])assert.match(html,new RegExp('value="'+kind+'"'));
  assert.match(html,/privacidad\.html/);
  assert.match(html,/no habilita viajes ni cobros reales/i);
  assert.match(source("index.html"),/href="\.\/conductores\.html"/);
  assert.match(source("piloto.html"),/href="\.\/conductores\.html"/);
  assert.match(html,/conductores\.js/);
});

test("UI de registro reutiliza backend existente, sin activación automática",()=>{
  new Function(js);
  for(const path of ["/api/health","/api/me","/api/auth/start","/api/auth/verify","/api/auth/logout","/api/driver/profile","/api/driver/documents","/api/driver/apply"])
    assert.ok(js.includes(path),"Missing route "+path);
  assert.match(js,/server-status/);
  assert.match(js,/health\.database/);
  assert.match(js,/health\.email_configured/);
  assert.match(js,/driver_status==="approved"/);
  assert.match(js,/mime:"image\/jpeg"/);
  assert.match(js,/sessionStorage\.setItem\("bm-viajes-pilot-token"/);
  assert.doesNotMatch(js,/localStorage\.setItem/);
  assert.doesNotMatch(js,/document\.write/);
  assert.doesNotMatch(js,/\.innerHTML\s*=/);
});

test("se informa la distinción entre demo y documentación privada",()=>{
  const privacy=source("privacidad.html");
  assert.match(privacy,/Inscripción de conductores/);
  assert.match(privacy,/cifrados/);
  assert.match(privacy,/rev(i|o)sión manual/i);
});
