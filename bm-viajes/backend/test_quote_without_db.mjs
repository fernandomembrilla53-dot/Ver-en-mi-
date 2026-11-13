// Run: node --test bm-viajes/backend/test_quote_without_db.mjs
// Uses the actual Worker handler, no D1, network, credentials or live rides.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';

const request = (path, env = {}, origin) => worker.fetch(new Request('https://example.test'+path, {headers: origin ? {Origin:origin} : {}}), env);
for (const [path,status,total] of [
  ['/api/fare/estimate?kind=one_way',200,4000],
  ['/api/fare/estimate?kind=round_trip&waitSeconds=600',200,7250],
  ['/api/fare/estimate?kind=one_way&night=true',200,4500],
  ['/api/fare/estimate?kind=one_way&kind=round_trip',400],
  ['/api/fare/estimate?kind=round_trip&night=true',400],
  ['/api/health',503],
  ['/api/rides/mine',503],
]) {
  test(path, async () => {
    const response = await request(path);
    assert.equal(response.status,status);
    if(total!==undefined) {
      const {estimate}=await response.json();
      assert.equal(estimate.total,total);
      assert.equal(estimate.simulationOnly,true);
    }
  });
}
test('unapproved origin remains blocked', async () => {
  const response=await request('/api/fare/estimate?kind=one_way',{FRONTEND_ORIGIN:'https://good.test'},'https://bad.test');
  assert.equal(response.status,403);
});
