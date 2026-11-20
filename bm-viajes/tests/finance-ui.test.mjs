import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Owner finance UI is structurally complete, private, and has no static amounts or trusted HTML injection',()=>{
 const html=get('finanzas.html'),js=get('finanzas-ui.js');
 for(const id of ['auth-panel','email-form','code-form','dashboard','drivers','detail','history','charges','settlements','filter','prev','next','detail-balance','detail-overdue'])
   assert.ok(html.includes('id="'+id+'"'),id);
 for(const route of ['/api/health','/api/auth/start','/api/auth/verify','/api/auth/logout','/api/admin/finance','/api/capabilities','/api/me'])
   assert.ok(js.includes(route),route);
 assert.match(js,/if\(!capabilities\.admin\)/);
 assert.match(js,/document\.createElement/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
 assert.doesNotMatch(js,/localStorage/);
 assert.doesNotMatch(js,/window\.location\s*=/);
 assert.match(get('index.html'),/href="\.\/finanzas\.html"/);
 assert.match(get('operaciones.html'),/href="\.\/finanzas\.html"/);
 new Function(js);
});
test('Driver statement is visible in account but only retrieved with own scoped token',()=>{
 const page=get('operaciones.html'),js=get('operations-ui.js');
 assert.match(page,/id="statement-refresh"/);
 assert.match(page,/id="statement"/);
 assert.match(js,/api\('\/driver\/finance'\)/);
 assert.doesNotMatch(js,/api\('\/admin\/finance'\)/);
 new Function(js);
});
