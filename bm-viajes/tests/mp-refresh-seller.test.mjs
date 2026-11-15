import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {refreshDriverToken} from '../backend/mp-refresh.mjs';
import {seal,unseal} from '../backend/mp-vault.mjs';
const now=()=>1000000;
async function setup(expires=now()+30000,updated=1){
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE mp_driver_accounts(driver_id TEXT PRIMARY KEY,seller_id TEXT,token_cipher TEXT,expires_at INTEGER,updated_at INTEGER)');
 const env={MP_SANDBOX_ENABLED:'true',MP_CLIENT_ID:'test',MP_CLIENT_SECRET:'test',MP_REDIRECT_URI:'https://example.invalid',MP_VAULT_KEY:Buffer.alloc(32,1).toString('base64url'),DB:{prepare(q){return {bind(...a){return {async first(){return sql.prepare(q).get(...a)},async run(){return {meta:{changes:Number(sql.prepare(q).run(...a).changes)}}}}}}}}};
 const cipher=await seal(env.MP_VAULT_KEY,'driver',{access_token:'old',refresh_token:'old-refresh'});
 sql.prepare('INSERT INTO mp_driver_accounts VALUES(?,?,?,?,?)').run('driver','123',cipher,expires,updated);
 return {env,sql};
}
const never=()=>{throw Error('unexpected provider call')};
test('wrong seller cannot trigger refresh or receive valid credentials',async()=>{const {env}=await setup(now()+120000);await assert.rejects(refreshDriverToken(env,'driver',never,now,'999'),/Seller unavailable/);});
test('ambiguous refresh lease blocks reuse even before token expires',async()=>{const {env}=await setup(now()+120000,Number.MAX_SAFE_INTEGER);await assert.rejects(refreshDriverToken(env,'driver',never,now,'123'),/Refresh in progress/);});
test('correct seller refreshes and stores encrypted credentials',async()=>{const {env,sql}=await setup();const result=await refreshDriverToken(env,'driver',async()=>Response.json({live_mode:false,user_id:123,access_token:'new',refresh_token:'new-refresh',expires_in:3600}),now,'123');assert.equal((await unseal(env.MP_VAULT_KEY,'driver',result.token_cipher)).access_token,'new');assert.equal(sql.prepare('SELECT updated_at FROM mp_driver_accounts').get().updated_at,now());});
