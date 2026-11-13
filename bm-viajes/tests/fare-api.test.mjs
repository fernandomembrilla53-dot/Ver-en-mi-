import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../backend/worker.mjs';

// No database operations, real rides, credentials or network are needed for estimates.
const env={DB:new Proxy({}, {get(){throw Error('Unexpected database access');}}),ENABLE_LIVE_RIDES:'false',FRONTEND_ORIGIN:'https://example.invalid'};
const cases=[
 ['kind=one_way',200,4000],
 ['kind=round_trip&waitSeconds=600',200,7250],
 ['kind=one_way&night=true',200,4500],
 ['kind=round_trip&night=true',400],
 ['kind=one_way&waitSeconds=1',400],
 ['kind=one_way&kind=round_trip',400],
 ['kind=one_way&price=1',400],
 ['kind=round_trip&waitSeconds=86401',400],
 ['kind=one_way&night=1',400],
 ['',400]
];
for(const [query,status,total] of cases)test('simulation fare: '+query,async()=>{
 const response=await worker.fetch(new Request('https://api.invalid/api/fare/estimate?'+query),env);
 assert.equal(response.status,status);
 assert.equal(response.headers.get('Cache-Control'),'no-store');
 const body=await response.json();
 assert.equal(body.ok,status===200);
 if(total!==undefined){assert.equal(body.estimate.total,total);assert.equal(body.estimate.simulationOnly,true);}
});
