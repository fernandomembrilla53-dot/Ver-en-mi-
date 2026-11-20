// BM Viajes: cuentas de choferes, historial y mora derivada del libro mayor inmutable.
// Solo el efectivo confirmado por AMBAS partes genera deuda de comisión.
// Pago acreditado: registros de commission_settlements (no capturas ni declaraciones).
const DAY=86400000;
const MAX_PAGE=50;
const DATE_LIMIT=100000;

export function financePolicy(env,now=Date.now()){
  const setting=String(env.COMMISSION_GRACE_DAYS??"7");
  const days=/^(?:[1-9]|[12][0-9]|30)$/.test(setting)?Number(setting):7;
  // Los bloqueos no se habilitan en la preparación del piloto.
  const enforce=env.ENABLE_LIVE_RIDES==="true"&&env.AUTO_BLOCK_DRIVER_DEBT==="true";
  return {grace_days:days,cutoff_ms:now-days*DAY,auto_block_enabled:enforce};
}

function account(balance,policy){
  const charged=Number(balance.charged_ars||0),paid=Number(balance.paid_ars||0),matured=Number(balance.matured_ars||0);
  const outstanding=Math.max(0,charged-paid),overdue=Math.max(0,matured-paid);
  return {
    charged_ars:charged,paid_ars:paid,commission_due_ars:outstanding,
    overdue_ars:overdue,commission_not_due_ars:outstanding-overdue,
    cash_ride_count:Number(balance.cash_ride_count||0),
    would_block_new_rides:overdue>0,
    auto_block_active:policy.auto_block_enabled&&overdue>0,
    grace_days:policy.grace_days,
    auto_block_enabled:policy.auto_block_enabled
  };
}

export async function driverBalance(env,driverId,now=Date.now()){
  const policy=financePolicy(env,now);
  const data=await env.DB.prepare(`
    SELECT
      (SELECT COALESCE(SUM(amount_ars),0) FROM driver_ledger WHERE driver_id=?) charged_ars,
      (SELECT COALESCE(SUM(amount_ars),0) FROM driver_ledger WHERE driver_id=? AND created_at<=?) matured_ars,
      (SELECT COALESCE(SUM(amount_ars),0) FROM commission_settlements WHERE driver_id=?) paid_ars,
      (SELECT COUNT(*) FROM driver_ledger WHERE driver_id=?) cash_ride_count
  `).bind(driverId,driverId,policy.cutoff_ms,driverId,driverId).first();
  return account(data||{},policy);
}

// Se evalúa al pedir disponibilidad, consultar solicitudes y aceptar una nueva.
// No impide entrar, pagar una deuda, reclamar ni finalizar un viaje ya aceptado.
export async function checkDebtForNewRide(env,driverId,ApiError){
  if(!financePolicy(env).auto_block_enabled)return;
  const balance=await driverBalance(env,driverId);
  if(balance.auto_block_active)throw new ApiError("Tenés una comisión vencida. Consultá tu estado de cuenta y regularizá el pago antes de aceptar viajes nuevos.",403);
}

// Chequeo adicional dentro del mismo UPDATE atómico que asigna el viaje:
// si entra un cargo ya vencido durante el pedido, no se omite el bloqueo.
export function acceptanceDebtSql(env,now,driverId){
  const p=financePolicy(env,now);
  return {
    clause:` AND (?=0 OR COALESCE((SELECT SUM(l.amount_ars) FROM driver_ledger l WHERE l.driver_id=? AND l.created_at<=?),0)
        <= COALESCE((SELECT SUM(s.amount_ars) FROM commission_settlements s WHERE s.driver_id=?),0))`,
    bindings:[p.auto_block_enabled?1:0,driverId,p.cutoff_ms,driverId]
  };
}

const balancesCte=`
WITH charges AS (
  SELECT driver_id,SUM(amount_ars) charged_ars,
    SUM(CASE WHEN created_at<=? THEN amount_ars ELSE 0 END) matured_ars,
    COUNT(*) cash_ride_count
  FROM driver_ledger GROUP BY driver_id
),
credits AS (
  SELECT driver_id,SUM(amount_ars) paid_ars
  FROM commission_settlements GROUP BY driver_id
),
balance AS (
 SELECT u.id AS driver_id,u.email,u.driver_status,p.display_name,p.vehicle,p.plate,
   CASE WHEN b.user_id IS NULL THEN 0 ELSE 1 END manually_blocked,
   COALESCE(c.charged_ars,0) charged_ars,COALESCE(c.matured_ars,0) matured_ars,
   COALESCE(v.paid_ars,0) paid_ars,COALESCE(c.cash_ride_count,0) cash_ride_count,
   MAX(0,COALESCE(c.charged_ars,0)-COALESCE(v.paid_ars,0)) commission_due_ars,
   MAX(0,COALESCE(c.matured_ars,0)-COALESCE(v.paid_ars,0)) overdue_ars
 FROM users u
 LEFT JOIN driver_profiles p ON p.user_id=u.id
 LEFT JOIN blocked_users b ON b.user_id=u.id
 LEFT JOIN charges c ON c.driver_id=u.id
 LEFT JOIN credits v ON v.driver_id=u.id
 WHERE u.driver_status<>'none' OR c.driver_id IS NOT NULL OR v.driver_id IS NOT NULL
    OR EXISTS(SELECT 1 FROM rides r WHERE r.driver_id=u.id)
)
`;

export async function adminFinances(env,{filter="all",offset=0}={}){
  if(!["all","unpaid","overdue"].includes(filter)||!Number.isInteger(offset)||offset<0||offset>DATE_LIMIT)throw Error("Filtro o página inválidos.");
  const policy=financePolicy(env);
  const filterClause=filter==="unpaid"?"commission_due_ars>0":filter==="overdue"?"overdue_ars>0":"1=1";
  const sql=balancesCte+`SELECT * FROM balance WHERE ${filterClause} ORDER BY overdue_ars DESC,commission_due_ars DESC,email ASC LIMIT ? OFFSET ?`;
  const result=await env.DB.prepare(sql).bind(policy.cutoff_ms,MAX_PAGE+1,offset).all();
  const rows=result.results||[];
  const figures=await env.DB.prepare(balancesCte+`
    SELECT COUNT(*) driver_count,
      COALESCE(SUM(commission_due_ars),0) commission_due_ars,
      COALESCE(SUM(overdue_ars),0) overdue_ars,
      COALESCE(SUM(charged_ars),0) charged_ars,
      COALESCE(SUM(paid_ars),0) paid_ars,
      COALESCE(SUM(CASE WHEN overdue_ars>0 THEN 1 ELSE 0 END),0) overdue_driver_count
    FROM balance`).bind(policy.cutoff_ms).first();
  return {
    ok:true,currency:"ARS",filter,offset,limit:MAX_PAGE,
    has_more:rows.length>MAX_PAGE,
    policy:{grace_days:policy.grace_days,auto_block_enabled:policy.auto_block_enabled,mode:"confirmed_cash_only"},
    totals:{...figures},
    drivers:rows.slice(0,MAX_PAGE).map(r=>({
      ...r,charged_ars:Number(r.charged_ars),matured_ars:Number(r.matured_ars),paid_ars:Number(r.paid_ars),
      commission_due_ars:Number(r.commission_due_ars),overdue_ars:Number(r.overdue_ars),
      auto_block_active:policy.auto_block_enabled&&r.overdue_ars>0,
      would_block_new_rides:r.overdue_ars>0
    }))
  };
}

export async function driverFinance(env,driverId,{offset=0}={}){
  if(!Number.isInteger(offset)||offset<0||offset>DATE_LIMIT)throw Error("Página inválida.");
  const driver=await env.DB.prepare(`
    SELECT u.id,u.email,u.driver_status,p.display_name,p.vehicle,p.plate
    FROM users u LEFT JOIN driver_profiles p ON p.user_id=u.id WHERE u.id=?
  `).bind(driverId).first();
  if(!driver)return null;
  const balances=await driverBalance(env,driverId);
  const history=await env.DB.prepare(`
    SELECT r.id,r.status,r.created_at,r.updated_at,
      f.kind AS fare_kind,f.base_ars,t.total_ars,t.commission_ars,t.finalized_at,
      COALESCE(m.method,'cash') AS payment_method,
      (SELECT COUNT(*) FROM cash_confirmations cc WHERE cc.ride_id=r.id) AS cash_confirmations,
      CASE WHEN l.id IS NULL THEN 0 ELSE 1 END AS commission_posted
    FROM rides r
    LEFT JOIN ride_fares f ON f.ride_id=r.id
    LEFT JOIN ride_totals t ON t.ride_id=r.id
    LEFT JOIN ride_payment_methods m ON m.ride_id=r.id
    LEFT JOIN driver_ledger l ON l.ride_id=r.id
    WHERE r.driver_id=?
    ORDER BY r.created_at DESC,r.id DESC LIMIT ? OFFSET ?
  `).bind(driverId,MAX_PAGE+1,offset).all();
  const entries=await env.DB.prepare(`
    SELECT id,ride_id,kind,amount_ars,created_at FROM driver_ledger
    WHERE driver_id=? ORDER BY created_at DESC,id DESC LIMIT 100
  `).bind(driverId).all();
  const paid=await env.DB.prepare(`
    SELECT id,provider_reference,amount_ars,verified_at FROM commission_settlements
    WHERE driver_id=? ORDER BY verified_at DESC,id DESC LIMIT 100
  `).bind(driverId).all();
  const rides=history.results||[];
  return {
    ok:true,currency:"ARS",driver,balances,
    offset,limit:MAX_PAGE,has_more:rides.length>MAX_PAGE,rides:rides.slice(0,MAX_PAGE),
    charges:entries.results||[],settlements:paid.results||[],
    note:"La deuda solo incluye comisiones por efectivo confirmado por ambas partes. No refleja comisiones retenidas directamente por Mercado Pago ni pagos pendientes de verificación bancaria."
  };
}
