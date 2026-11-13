// Proposed Ayacucho tariff, for simulation only. No payment or ride activation.
// All monetary amounts are integer ARS. Waiting is rounded up after the grace period.
export const TARIFF = Object.freeze({version:'ayacucho-proposal-1',oneWay:4000,roundTrip:6000,nightOneWay:4500,freeWaitSeconds:300,waitPerMinute:250,commissionPercent:10});
export function estimateUrbanFare({kind,night=false,waitSeconds=0}={}) {
  if (!['one_way','round_trip'].includes(kind) || typeof night !== 'boolean' || !Number.isSafeInteger(waitSeconds) || waitSeconds<0 || waitSeconds>86400) throw new RangeError('Invalid fare inputs');
  if (kind==='round_trip' && night) throw new RangeError('Night round-trip tariff not defined');
  if (kind==='one_way' && waitSeconds!==0) throw new RangeError('Waiting is only defined for round trips');
  const base=kind==='round_trip'?TARIFF.roundTrip:night?TARIFF.nightOneWay:TARIFF.oneWay;
  const billableMinutes=Math.ceil(Math.max(0,waitSeconds-TARIFF.freeWaitSeconds)/60);
  const waiting=billableMinutes*TARIFF.waitPerMinute;
  const total=base+waiting,commission=total*TARIFF.commissionPercent/100;
  return {version:TARIFF.version,currency:'ARS',base,waiting,billableMinutes,total,commission,driverNet:total-commission,simulationOnly:true};
}
