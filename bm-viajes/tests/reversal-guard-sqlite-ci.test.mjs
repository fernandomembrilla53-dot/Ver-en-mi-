import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
test('SQLite real: refund update guards, full schema and ten Python regressions',()=>{
  const r=spawnSync('python3',['-m','unittest','discover','-s','bm-viajes/backend/tests','-p','test_reversal_guards.py','-v'],{cwd:root,encoding:'utf8',timeout:20000});
  assert.equal(r.error,undefined,String(r.error));
  assert.equal(r.status,0,(r.stdout||'')+'\n'+(r.stderr||''));
  assert.match(r.stderr,/Ran 10 tests/);
});
test('Migration 0008 update guard and full schema agree',()=>{
 const schema=readFileSync(resolve(root,'bm-viajes/backend/schema.sql'),'utf8');
 const migration=readFileSync(resolve(root,'bm-viajes/backend/migrations/0008_mp_reversal_update_guard.sql'),'utf8');
 const extract=s=>s.slice(s.indexOf('CREATE TRIGGER IF NOT EXISTS mp_reversal_update_guard')).trim();
 assert.ok(extract(schema).startsWith(extract(migration)),'Schema and migration must implement the same update trigger');
});
