import test from "node:test";
import assert from "node:assert/strict";
import worker from "../backend/worker.mjs";

const request = () => new Request("https://pilot.example.invalid/api/health");
const db = (count, fail=false) => ({prepare(sql){
  assert.match(sql,/sqlite_master/);
  return {async first(){if(fail)throw new Error("private DB error");return {ready_tables:count};}};
}});
test("health requires a configured database",async()=>{
  assert.equal((await worker.fetch(request(),{})).status,503);
});
test("health checks schema and preserves disabled rides",async()=>{
  const response=await worker.fetch(request(),{DB:db(6),ENABLE_LIVE_RIDES:"false"});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.database,"ready");
  assert.equal(body.mode,"demo");
});
test("health rejects incomplete schema or unavailable database without leaking errors",async()=>{
  for(const DB of [db(5),db(6,true)]){
    const response=await worker.fetch(request(),{DB});
    assert.equal(response.status,503);
    assert.equal((await response.json()).error,"Base de datos no disponible o esquema incompleto.");
  }
});
