import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../../.github/workflows/bm-viajes-gmail-only.yml',import.meta.url),'utf8');
const doc=readFileSync(new URL('../backend/GMAIL-CONFIG.md',import.meta.url),'utf8');
const backend=readFileSync(new URL('../backend/gmail.mjs',import.meta.url),'utf8');

test('Gmail setup is manually triggered and applies only to BM Viajes worker',()=>{
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/bm-viajes-api/);
 assert.match(workflow,/secret put GMAIL_CLIENT_ID/);
 assert.match(workflow,/secret put GMAIL_CLIENT_SECRET/);
 assert.match(workflow,/secret put GMAIL_REFRESH_TOKEN/);
 assert.match(workflow,/secret put GMAIL_SENDER_EMAIL/);
 assert.match(workflow,/secret put EMAIL_PROVIDER/);
 assert.ok(workflow.indexOf('secret put EMAIL_PROVIDER')>workflow.indexOf('secret put GMAIL_REFRESH_TOKEN'));
 assert.ok(workflow.indexOf('Verificar credenciales sin exponerlas')<workflow.indexOf('Configurar únicamente los cinco secretos'));
 assert.doesNotMatch(workflow,/wrangler deploy|d1 execute|d1 create|workers\/scripts\/radar|ENABLE_LIVE_RIDES.*true/);
 assert.match(workflow,/EMAIL_PROVIDER|GMAIL_SENDER_EMAIL/);
});
test('Setup uses existing narrow gmail.send and documents no public refresh tokens',()=>{
 assert.match(backend,/gmail\/v1\/users\/me\/messages\/send/);
 for(const name of ['BM_VIAJES_GMAIL_CLIENT_ID','BM_VIAJES_GMAIL_CLIENT_SECRET','BM_VIAJES_GMAIL_REFRESH_TOKEN'])assert.ok(doc.includes(name));
 assert.match(doc,/no pegarlos en ChatGPT/i);
 assert.match(doc,/siete días/i);
});
