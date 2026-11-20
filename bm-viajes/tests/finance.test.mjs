import test from "node:test";
import assert from "node:assert/strict";
import worker from "../backend/worker.mjs";
import {driverFinance,adminFinances,driverBalance,financePolicy} from "../backend/finance.mjs";
import {localD1} from "./helpers/local-d1.mjs";

const DAY=86400000;
async function setup(t){
 const DB=localD1();
 t.after(()=>DB.close());
 const now=Date.now(),env={DB,AUTH_SECRET:"offline-finance-test-secret-xxxxxxxxxxxx",ENABLE_LIVE_RIDES:"false",AUTO_BLOCK_DRIVER_DEBT:"true",FRONTEND_ORIGIN:"https://finance.example.invalid"};
 const members={};
 for(const role of ["admin","driver","rider","other"]){
  const id=crypto.randomUUID(),token=Buffer.from(role.padEnd(32,"x")).toString("hex"),hash=Buffer.from(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))).toString("hex");
  await DB.prepare("INSERT INTO users VALUES(?,?,?,?)").bind(id,role+"@example.invalid",role==="driver"?"approved":"none",now).run();
  await DB.prepare("INSERT INTO sessions VALUES(?,?,?,?)").bind(hash,id,now+DAY,now).run();
  members[role]={id,token};
 }
 await DB.prepare("INSERT INTO admin_users VALUES(?)").bind(members.admin.id).run();
 async function request(role,path,{method="GET",data,status=200}={}){
  const r=await worker.fetch(new Request("https://test.invalid/api"+path,{
   method,headers:{"Authorization":"Bearer "+members[role].token,"Content-Type":"application/json","CF-Connecting-IP":"192.0.2.1","Origin":env.FRONTEND_ORIGIN},
   ...(data!==undefined?{body:JSON.stringify(data)}:{})
  }),env);
  const body=await r.json();
  assert.equal(r.status,status,`${role} ${method} ${path}: ${JSON.stringify(body)}`);
  return body;
 }
 async function cashRide({postedAt=now-8*DAY,driver=members.driver.id,amount=400}={}){
  const ride=crypto.randomUUID();
  await DB.prepare("INSERT INTO rides VALUES(?,?,?,?,?,?,?,?,'completed',?,?,?)")
   .bind(ride,members.rider.id,driver,-37.15,-58.48,-37.16,-58.49,1,postedAt-10000,postedAt-1000,postedAt+10000).run();
  await DB.prepare("INSERT INTO ride_fares VALUES(?,'one_way','v1',4000,1000,0,0,?)").bind(ride,postedAt-15000).run();
  await DB.prepare("INSERT INTO ride_totals VALUES(?,0,0,4000,?,?)").bind(ride,amount,postedAt).run();
  await DB.prepare("INSERT INTO cash_confirmations VALUES(?,'rider',?,?)").bind(ride,members.rider.id,postedAt).run();
  await DB.prepare("INSERT INTO cash_confirmations VALUES(?,'driver',?,?)").bind(ride,driver,postedAt).run();
  return ride;
 }
 async function pay(amount,ref="bank-test-001"){
  await DB.prepare("INSERT INTO commission_settlements VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),members.driver.id,ref,amount,Date.now()).run();
 }
 return {DB,env,members,request,cashRide,pay};
}

test("driver's own statement includes individual history, verified credits and immutable charge",async t=>{
 const f=await setup(t);
 const ride=await f.cashRide();
 const self=await f.request("driver","/driver/finance");
 assert.equal(self.balances.charged_ars,400);
 assert.equal(self.balances.commission_due_ars,400);
 assert.equal(self.balances.overdue_ars,400);
 assert.equal(self.balances.auto_block_active,false,"not active in pilot");
 assert.equal(self.rides[0].id,ride);
 assert.equal(self.rides[0].payment_method,"cash");
 assert.equal(self.rides[0].cash_confirmations,2);
 assert.equal(self.rides[0].commission_posted,1);
 await f.request("rider","/admin/finance",{status:403});
 await f.request("driver","/admin/finance/"+f.members.other.id,{status:403});
 await f.pay(150);
 const after=await f.request("driver","/driver/finance");
 assert.equal(after.balances.paid_ars,150);
 assert.equal(after.balances.commission_due_ars,250);
 assert.equal(after.balances.overdue_ars,250);
 assert.equal(after.settlements.length,1);
 const admin=await f.request("admin","/admin/finance");
 const driver=admin.drivers.find(d=>d.driver_id===f.members.driver.id);
 assert.equal(driver.commission_due_ars,250);
 assert.equal(admin.totals.commission_due_ars,250);
 assert.equal(driver.auto_block_active,false);
 const detail=await f.request("admin","/admin/finance/"+f.members.driver.id);
 assert.equal(detail.rides[0].id,ride);
 assert.equal(detail.charges[0].amount_ars,400);
 assert.equal(detail.settlements[0].amount_ars,150);
});

test("FIFO allocation: recent unpaid charge does not cause overdue when oldest charge fully paid",async t=>{
 const f=await setup(t),now=Date.now();
 await f.cashRide({postedAt:now-12*DAY,amount:400});
 await f.cashRide({postedAt:now-1*DAY,amount:400});
 await f.pay(400);
 const balance=await driverBalance(f.env,f.members.driver.id);
 assert.equal(balance.commission_due_ars,400);
 assert.equal(balance.overdue_ars,0);
 const overdue=await f.request("admin","/admin/finance?filter=overdue");
 assert.ok(!overdue.drivers.some(d=>d.driver_id===f.members.driver.id));
 const unpaid=await f.request("admin","/admin/finance?filter=unpaid");
 assert.ok(unpaid.drivers.some(d=>d.driver_id===f.members.driver.id));
});

test("automated overdue prevention is opt-in and applies only to NEW requests, not login or balances",async t=>{
 const f=await setup(t);
 await f.cashRide();
 assert.equal(financePolicy(f.env).auto_block_enabled,false);
 await f.request("driver","/driver/finance");
 f.env.ENABLE_LIVE_RIDES="true";
 assert.equal(financePolicy(f.env).auto_block_enabled,true);
 await f.request("driver","/rides/open",{status:403});
 await f.request("driver","/driver/availability",{method:"POST",data:{available:true,lat:-37.15,lng:-58.48,accuracy_m:20},status:403});
 await f.request("driver","/driver/finance");
 await f.pay(400);
 await f.request("driver","/rides/open");
 const after=await f.request("driver","/driver/finance");
 assert.equal(after.balances.auto_block_active,false);
 assert.equal(after.balances.overdue_ars,0);
});

test("admin financial pagination and inputs, private access",async t=>{
 const f=await setup(t);
 await f.cashRide();
 await f.request("admin","/admin/finance?filter=unknown",{status:400});
 await f.request("admin","/admin/finance?offset=-1",{status:400});
 await f.request("admin","/admin/finance/"+crypto.randomUUID(),{status:404});
 await f.request("driver","/driver/finance?offset=not-a-number",{status:400});
 const all=await f.request("admin","/admin/finance?offset=0");
 assert.ok(Array.isArray(all.drivers));
 assert.equal(all.policy.grace_days,7);
 assert.equal(all.policy.auto_block_enabled,false);
 await assert.rejects(f.DB.prepare("UPDATE driver_ledger SET amount_ars=1").run(),/immutable ledger/);
});

test("atomic ride acceptance refuses overdue driver and allows new ride after full verified settlement",async t=>{
 const f=await setup(t);
 await f.cashRide();
 f.env.ENABLE_LIVE_RIDES="true";
 const ride=crypto.randomUUID(),now=Date.now();
 await f.DB.prepare("INSERT INTO rides(id,rider_id,origin_lat,origin_lng,destination_lat,destination_lng,distance_air_km,status,created_at,updated_at,expires_at) VALUES(?,?,?,?,?,?,?,'requested',?,?,?)")
   .bind(ride,f.members.rider.id,-37.1515,-58.4859,-37.16,-58.49,1.1,now,now,now+600000).run();
 await f.DB.prepare("INSERT INTO ride_fares VALUES(?,'one_way','v1',4000,1000,0,0,?)").bind(ride,now).run();
 await f.request("driver","/rides/"+ride+"/accept",{method:"POST",status:403});
 assert.equal((await f.DB.prepare("SELECT driver_id,status FROM rides WHERE id=?").bind(ride).first()).status,"requested");
 await f.pay(400);
 await f.request("driver","/rides/"+ride+"/accept",{method:"POST"});
 const record=await f.DB.prepare("SELECT driver_id,status FROM rides WHERE id=?").bind(ride).first();
 assert.equal(record.driver_id,f.members.driver.id);
 assert.equal(record.status,"accepted");
 await f.cashRide({postedAt:Date.now()-10*DAY});
 await f.request("driver","/rides/"+ride+"/status",{method:"POST",data:{status:"in_progress"}});
 await f.request("driver","/rides/"+ride+"/status",{method:"POST",data:{status:"completed"}});
 assert.equal((await f.DB.prepare("SELECT status FROM rides WHERE id=?").bind(ride).first()).status,"completed");
});

test("admin finance pagination scales beyond 50 drivers and does not merge records",async t=>{
 const f=await setup(t);
 for(let n=0;n<57;n++){
  const email="transport"+String(n).padStart(3,"0")+"@example.invalid";
  await f.DB.prepare("INSERT INTO users VALUES(?,?,?,?)").bind(crypto.randomUUID(),email,"pending",Date.now()).run();
 }
 const first=await f.request("admin","/admin/finance?offset=0");
 assert.equal(first.drivers.length,50);
 assert.equal(first.has_more,true);
 const second=await f.request("admin","/admin/finance?offset=50");
 assert.equal(second.drivers.length,8);
 assert.equal(second.has_more,false);
 assert.equal(new Set([...first.drivers,...second.drivers].map(x=>x.driver_id)).size,58);
});
