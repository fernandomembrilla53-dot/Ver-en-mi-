// Regression: a delayed D1 write must not rewind the driver's location.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
test("GPS writes preserve newest server timestamp and authorization", () => {
 const source=readFileSync(new URL("../backend/worker.mjs",import.meta.url),"utf8");
 const sql=source.match(/prepare\("(INSERT INTO ride_positions\(ride_id,driver_id,lat,lng,accuracy_m,updated_at\)[^"]+)"\)/)?.[1];
 assert.ok(sql,"GPS SQL must be found in worker");
 const db=new DatabaseSync(":memory:");
 try {
 db.exec(readFileSync(new URL("../backend/schema.sql",import.meta.url),"utf8"));
 db.exec("INSERT INTO users(id,email,driver_status,created_at) VALUES ('d','d@example.invalid','approved',1),('p','p@example.invalid','none',1); INSERT INTO rides(id,rider_id,driver_id,origin_lat,origin_lng,destination_lat,destination_lng,distance_air_km,status,created_at,updated_at,expires_at) VALUES ('r','p','d',1,2,3,4,1,'accepted',1,1,1000)");
 const save=(t,lat)=>Number(db.prepare(sql).run(lat,2,10,t,"r","d").changes);
 const position=()=>db.prepare("SELECT lat,updated_at FROM ride_positions").get();
 assert.equal(save(200,1),1);
 assert.equal(save(100,3),0);
 assert.equal(position().lat,1);
 assert.equal(position().updated_at,200);
 assert.equal(save(300,4),1);
 assert.equal(position().lat,4);
 assert.equal(position().updated_at,300);
 db.exec("UPDATE users SET driver_status='suspended' WHERE id='d'");
 assert.equal(save(400,5),0);
 db.exec("UPDATE users SET driver_status='approved' WHERE id='d'; UPDATE rides SET status='completed' WHERE id='r'");
 assert.equal(save(500,6),0);
 } finally {db.close();}
});
