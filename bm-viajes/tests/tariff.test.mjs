import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateUrbanFare as fare} from '../backend/tariff.mjs';
test('direct and night',()=>{assert.equal(fare({kind:'one_way'}).total,4000);assert.equal(fare({kind:'one_way',night:true}).total,4500);});
test('round trip grace boundary',()=>{for(const s of [0,299,300])assert.equal(fare({kind:'round_trip',waitSeconds:s}).total,6000);assert.equal(fare({kind:'round_trip',waitSeconds:301}).total,6250);});
test('ten minutes and commission',()=>{const x=fare({kind:'round_trip',waitSeconds:600});assert.equal(x.total,7250);assert.equal(x.commission,725);assert.equal(x.driverNet,6525);assert.equal(x.simulationOnly,true);});
test('reject unsupported or malformed inputs',()=>{for(const x of [{kind:'rural'},{kind:'round_trip',night:true},{kind:'one_way',waitSeconds:1},{kind:'round_trip',waitSeconds:-1},{kind:'round_trip',waitSeconds:'600'},{kind:'round_trip',waitSeconds:Infinity},{kind:'round_trip',waitSeconds:1.5},{kind:'round_trip',night:'false'}])assert.throws(()=>fare(x),RangeError);});
