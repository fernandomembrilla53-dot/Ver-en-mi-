import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../backend/worker.mjs';
import { localD1 } from './helpers/local-d1.mjs';

const origin = { lat: -37.1515, lng: -58.4859 };
const destination = { lat: -37.165, lng: -58.49 };
const route = { origin, destination };

function fixture(t) {
  const DB = localD1(), mailbox = new Map(), unexpected = [];
  // Never read process.env, wrangler config, production URLs or credentials.
  const env = { DB, AUTH_SECRET: 'offline-test-secret-not-for-production-0001',
    BREVO_API_KEY: 'fake-offline-key', MAIL_FROM: 'sender@example.invalid',
    FRONTEND_ORIGIN: 'https://bm-viajes.example.invalid', ENABLE_LIVE_RIDES: 'false' };
  t.after(() => { DB.close(); assert.deepEqual(unexpected, [], 'unexpected outbound request'); });
  // No request is forwarded. Unexpected calls fail AND are recorded, even if
  // the worker catches the error and would otherwise hide it from the test.
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url !== 'https://api.brevo.com/v3/smtp/email' || options?.method !== 'POST') {
      unexpected.push(String(url)); throw new Error('Network disabled in backend tests');
    }
    assert.equal(options.headers['api-key'], 'fake-offline-key');
    const mail = JSON.parse(options.body);
    assert.match(mail.to[0].email, /@example\.invalid$/);
    const code = mail.textContent.match(/\b\d{6}\b/)?.[0];
    assert.ok(code, 'OTP must be delivered to the fake mailbox');
    mailbox.set(mail.to[0].email, code);
    return new Response('{}', { status: 201 });
  });
  async function api(method, path, token, body, status = 200) {
    const headers = { Origin: env.FRONTEND_ORIGIN, 'CF-Connecting-IP': '192.0.2.10' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await worker.fetch(new Request(`https://backend.example.invalid/api${path}`, {
      method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), env);
    const data = await response.json();
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
    assert.equal(data.ok, status < 400);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), env.FRONTEND_ORIGIN);
    return data;
  }
  async function login(name) {
    const email = `${name}@example.invalid`;
    await api('POST', '/auth/start', null, { email });
    const code = mailbox.get(email);
    assert.ok(code);
    const session = await api('POST', '/auth/verify', null, { email, code });
    assert.match(session.token, /^[0-9a-f]{64}$/);
    assert.equal(session.user.driver_status, 'none');
    return session;
  }
  async function approve(driver) {
    await api('POST', '/driver/apply', driver.token, { accept_review: true });
    assert.equal((await api('GET', '/me', driver.token)).user.driver_status, 'pending');
    // Manual approval has no API. This fixture changes ONLY the in-memory DB.
    await DB.prepare("UPDATE users SET driver_status='approved' WHERE id=?").bind(driver.user.id).run();
  }
  async function participants() {
    const rider = await login('passenger'), driver = await login('driver');
    await approve(driver);
    // Only this local JS object enables the state machine; no deployed setting changes.
    env.ENABLE_LIVE_RIDES = 'true';
    return { rider, driver };
  }
  return { env, DB, mailbox, api, login, approve, participants };
}

test('complete passenger/driver journey: OTP, approval, request, GPS, completion, history, logout', async t => {
  const f = fixture(t), { api, DB } = f;
  assert.equal((await api('GET', '/config')).live_rides_enabled, false);
  const { rider, driver } = await f.participants();
  const outsider = await f.login('outsider');
  const ride = await api('POST', '/rides', rider.token, route, 201), id = ride.ride_id;
  assert.equal(ride.status, 'requested');
  assert.equal(ride.fare_ars, null);
  assert.equal(ride.payment_status, 'not_implemented');
  await api('POST', '/rides', rider.token, route, 409);
  const open = (await api('GET', '/rides/open', driver.token)).rides;
  assert.equal(open.length, 1);
  assert.equal(open[0].id, id);
  assert.deepEqual(open[0].origin, { lat: -37.151, lng: -58.486 });
  assert.equal(open[0].rider_id, undefined);
  await api('GET', `/rides/${id}`, outsider.token, undefined, 403);
  await api('POST', `/rides/${id}/accept`, driver.token);
  assert.equal((await api('GET', `/rides/${id}`, rider.token)).ride.driver_id, driver.user.id);
  await api('POST', `/rides/${id}/status`, rider.token, { status: 'in_progress' }, 409);
  await api('POST', `/rides/${id}/status`, driver.token, { status: 'completed' }, 409);
  for (const position of [origin, { lat: -37.16, lng: -58.488 }, destination]) {
    await api('POST', `/rides/${id}/location`, driver.token, { position, accuracy_m: 8 });
    const gps = (await api('GET', `/rides/${id}/location`, rider.token)).position;
    assert.equal(gps.lat, position.lat); assert.equal(gps.lng, position.lng);
    assert.equal(gps.accuracy_m, 8);
    if (position === origin) await api('POST', `/rides/${id}/status`, driver.token, { status: 'in_progress' });
  }
  await api('GET', `/rides/${id}/location`, outsider.token, undefined, 403);
  await api('POST', `/rides/${id}/status`, driver.token, { status: 'completed' });
  assert.equal((await api('GET', `/rides/${id}/location`, rider.token)).position, null);
  assert.equal(await DB.prepare('SELECT * FROM ride_positions WHERE ride_id=?').bind(id).first(), null);
  await api('POST', `/rides/${id}/location`, driver.token, { position: origin, accuracy_m: 8 }, 403);
  for (const user of [rider, driver]) {
    const history = (await api('GET', '/rides/mine', user.token)).rides;
    assert.equal(history.length, 1); assert.equal(history[0].status, 'completed');
    assert.equal(history[0].id, id);
    await api('POST', '/auth/logout', user.token);
    await api('GET', '/me', user.token, undefined, 401);
  }
  assert.equal((await api('GET', '/config')).payments_enabled, false);
});

test('default and emergency stop block creation, acceptance, transitions and GPS', async t => {
  const f = fixture(t), { api, env, DB } = f;
  const { rider, driver } = await f.participants();
  env.ENABLE_LIVE_RIDES = 'false';
  await api('POST', '/rides', rider.token, route, 503);
  assert.equal((await DB.prepare('SELECT count(*) AS n FROM rides').first()).n, 0);
  env.ENABLE_LIVE_RIDES = 'true';
  const { ride_id: id } = await api('POST', '/rides', rider.token, route, 201);
  await api('POST', `/rides/${id}/accept`, driver.token);
  await api('POST', `/rides/${id}/location`, driver.token, { position: origin, accuracy_m: 8 });
  env.ENABLE_LIVE_RIDES = 'false';
  for (const [method, path, body] of [
    ['GET', '/rides/open'], ['POST', `/rides/${id}/accept`],
    ['POST', `/rides/${id}/status`, { status: 'in_progress' }],
    ['POST', `/rides/${id}/location`, { position: destination, accuracy_m: 8 }],
    ['GET', `/rides/${id}/location`],
  ]) await api(method, path, driver.token, body, 503);
  assert.equal((await api('GET', `/rides/${id}`, rider.token)).ride.status, 'accepted');
});

test('unapproved drivers cannot list or accept; OTP cannot be reused', async t => {
  const f = fixture(t), { api } = f;
  const { rider } = await f.participants(), pending = await f.login('pending');
  await api('POST', '/driver/apply', pending.token, { accept_review: true });
  const { ride_id: id } = await api('POST', '/rides', rider.token, route, 201);
  await api('GET', '/rides/open', pending.token, undefined, 403);
  await api('POST', `/rides/${id}/accept`, pending.token, undefined, 403);
  await api('POST', '/auth/verify', null, { email: pending.user.email, code: f.mailbox.get(pending.user.email) }, 401);
  await api('GET', '/rides/mine', null, undefined, 401);
});

test('cancellation removes GPS and allows a new request', async t => {
  const f = fixture(t), { api, DB } = f, { rider, driver } = await f.participants();
  const { ride_id: id } = await api('POST', '/rides', rider.token, route, 201);
  await api('POST', `/rides/${id}/accept`, driver.token);
  await api('POST', `/rides/${id}/location`, driver.token, { position: origin, accuracy_m: 8 });
  await api('POST', `/rides/${id}/status`, rider.token, { status: 'cancelled' });
  assert.equal((await api('GET', `/rides/${id}`, driver.token)).ride.status, 'cancelled');
  assert.equal(await DB.prepare('SELECT * FROM ride_positions WHERE ride_id=?').bind(id).first(), null);
  await api('POST', `/rides/${id}/status`, driver.token, { status: 'in_progress' }, 409);
  await api('POST', '/rides', rider.token, route, 201);
});

test('stale GPS is hidden; suspended driver cannot start or publish location', async t => {
  const f = fixture(t), { api, DB } = f, { rider, driver } = await f.participants();
  const { ride_id: id } = await api('POST', '/rides', rider.token, route, 201);
  await api('POST', `/rides/${id}/accept`, driver.token);
  await api('POST', `/rides/${id}/location`, driver.token, { position: origin, accuracy_m: 301 }, 400);
  await api('POST', `/rides/${id}/location`, driver.token, { position: origin, accuracy_m: 8 });
  await DB.prepare('UPDATE ride_positions SET updated_at=? WHERE ride_id=?').bind(Date.now() - 121000, id).run();
  assert.equal((await api('GET', `/rides/${id}/location`, rider.token)).position, null);
  await api('POST', `/rides/${id}/location`, driver.token, { position: origin, accuracy_m: 8 });
  await DB.prepare("UPDATE users SET driver_status='suspended' WHERE id=?").bind(driver.user.id).run();
  assert.equal((await api('GET', `/rides/${id}/location`, rider.token)).position, null);
  await api('POST', `/rides/${id}/location`, driver.token, { position: origin, accuracy_m: 8 }, 403);
  await api('POST', `/rides/${id}/status`, driver.token, { status: 'in_progress' }, 409);
  await api('POST', `/rides/${id}/status`, driver.token, { status: 'cancelled' });
});

test('terminal transition rolls back if GPS cleanup fails', async t => {
  const f = fixture(t), { api, DB } = f, { rider, driver } = await f.participants();
  const { ride_id: id } = await api('POST', '/rides', rider.token, route, 201);
  await api('POST', `/rides/${id}/accept`, driver.token);
  await api('POST', `/rides/${id}/location`, driver.token, { position: origin, accuracy_m: 8 });
  await DB.prepare("CREATE TRIGGER fail_cleanup BEFORE DELETE ON ride_positions BEGIN SELECT RAISE(ABORT, 'injected failure'); END").run();
  await api('POST', `/rides/${id}/status`, rider.token, { status: 'cancelled' }, 500);
  assert.equal((await api('GET', `/rides/${id}`, rider.token)).ride.status, 'accepted');
  assert.ok(await DB.prepare('SELECT * FROM ride_positions WHERE ride_id=?').bind(id).first());
  await DB.prepare('DROP TRIGGER fail_cleanup').run();
  await api('POST', `/rides/${id}/status`, rider.token, { status: 'cancelled' });
});

test('two competing drivers produce exactly one acceptance', async t => {
  const f = fixture(t), { api, env } = f, { rider, driver } = await f.participants();
  const other = await f.login('other-driver'); await f.approve(other);
  const { ride_id: id } = await api('POST', '/rides', rider.token, route, 201);
  const responses = await Promise.all([driver, other].map(user => worker.fetch(
    new Request(`https://backend.example.invalid/api/rides/${id}/accept`, {
      method: 'POST', headers: { Authorization: `Bearer ${user.token}` },
    }), env)));
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  const winner = responses[0].status === 200 ? driver : other;
  const loser = responses[0].status === 200 ? other : driver;
  assert.equal((await api('GET', `/rides/${id}`, rider.token)).ride.driver_id, winner.user.id);
  await api('GET', `/rides/${id}`, loser.token, undefined, 403);
  assert.equal((await api('GET', '/rides/open', loser.token)).rides.length, 0);
});

test('scheduled cleanup expires a pending request without waiting in real time', async t => {
  const f = fixture(t), { api, DB, env } = f, { rider, driver } = await f.participants();
  const { ride_id: id } = await api('POST', '/rides', rider.token, route, 201);
  await DB.prepare('UPDATE rides SET expires_at=? WHERE id=?').bind(Date.now() - 1000, id).run();
  assert.equal((await api('GET', '/rides/open', driver.token)).rides.length, 0);
  // Both reads must agree before the scheduled cleanup actually runs.
  assert.equal((await api('GET', `/rides/${id}`, rider.token)).ride.status, 'cancelled');
  assert.equal((await api('GET', '/rides/mine', rider.token)).rides[0].status, 'cancelled');
  assert.equal((await DB.prepare('SELECT status FROM rides WHERE id=?').bind(id).first()).status, 'requested');
  await api('POST', `/rides/${id}/accept`, driver.token, undefined, 409);
  const tasks = [];
  await worker.scheduled({}, env, { waitUntil(promise) { tasks.push(promise); } });
  await Promise.all(tasks);
  assert.equal((await api('GET', `/rides/${id}`, rider.token)).ride.status, 'cancelled');
  await api('POST', '/rides', rider.token, route, 201);
});
