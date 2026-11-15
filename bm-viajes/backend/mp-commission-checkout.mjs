// Independent platform checkout; sandbox only. Never credits the ledger.
export function commissionCheckoutReady(env){
 return env.MP_COMMISSION_SANDBOX_ENABLED==='true' && env.ENABLE_LIVE_RIDES==='false' &&
 typeof env.MP_COMMISSION_ACCESS_TOKEN==='string' && env.MP_COMMISSION_ACCESS_TOKEN.startsWith('TEST-') &&
 /^[1-9]\d*$/.test(env.MP_COMMISSION_COLLECTOR_ID||'') && !!env.MP_COMMISSION_WEBHOOK_URL;
}
export async function createCommissionCheckout(env,user,fetcher=fetch){
 if(!commissionCheckoutReady(env)||user.driver_status!=='approved')throw Error('Commission checkout unavailable');
 const db=env.DB;
 const existing=await db.prepare("SELECT status,checkout_url FROM commission_checkout_intents WHERE driver_id=? AND status IN ('creating','ready','review')").bind(user.id).first();
 if(existing){if(existing.status==='ready')return {checkout_url:existing.checkout_url};throw Error('Commission checkout requires review');}
 const id=crypto.randomUUID(),reference='bm-viajes:commission:'+id;
 const notification=new URL(env.MP_COMMISSION_WEBHOOK_URL);
 if(notification.protocol!=='https:'||notification.username||notification.password)throw Error('Invalid webhook URL');
 notification.searchParams.set('settlement',id);
 const balance=await db.prepare("SELECT (SELECT COALESCE(SUM(amount_ars),0) FROM driver_ledger WHERE driver_id=?) - (SELECT COALESCE(SUM(amount_ars),0) FROM commission_settlements WHERE driver_id=?) AS due").bind(user.id,user.id).first();
 const amount=balance?.due;
 if(!Number.isSafeInteger(amount)||amount<=0)throw Error('No outstanding commission');
 const reserved=await db.prepare("INSERT INTO commission_checkout_intents(id,driver_id,amount_ars,collector_id,external_reference,status,created_at) VALUES(?,?,?,?,?,'creating',?) ON CONFLICT DO NOTHING").bind(id,user.id,amount,env.MP_COMMISSION_COLLECTOR_ID,reference,Date.now()).run();
 if(reserved.meta.changes!==1)throw Error('Commission checkout already reserved');
 try{
  const response=await fetcher('https://api.mercadopago.com/checkout/preferences',{method:'POST',headers:{Authorization:'Bearer '+env.MP_COMMISSION_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({items:[{title:'Liquidación de comisiones BM Viajes',quantity:1,currency_id:'ARS',unit_price:amount}],external_reference:reference,notification_url:notification.href}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Provider rejected preference');
  const p=await response.json(),url=new URL(p.sandbox_init_point);
  if(typeof p.id!=='string'||!p.id||url.protocol!=='https:'||url.username||url.password||!['sandbox.mercadopago.com.ar','sandbox.mercadopago.com'].includes(url.hostname))throw Error('Invalid sandbox preference');
  const saved=await db.prepare("UPDATE commission_checkout_intents SET status='ready',preference_id=?,checkout_url=? WHERE id=? AND status='creating'").bind(p.id,url.href,id).run();
  if(saved.meta.changes!==1)throw Error('Commission checkout state changed');
  return {checkout_url:url.href};
 }catch{
  await db.prepare("UPDATE commission_checkout_intents SET status='review' WHERE id=? AND status='creating'").bind(id).run();
  throw Error('Commission checkout requires review');
 }
}
