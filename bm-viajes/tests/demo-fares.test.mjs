import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estimateUrbanFare } from "../backend/tariff.mjs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
test("BM Viajes demo displays exactly the backend's daytime $4,000/$6,000 pilot bases", () => {
  const direct = estimateUrbanFare({kind:"one_way"});
  const round = estimateUrbanFare({kind:"round_trip"});
  assert.equal(direct.base,4000);
  assert.equal(round.base,6000);
  assert.match(html, /data-type="one_way"/);
  assert.match(html, /data-type="round_trip"/);
  assert.match(html, /var types=\{one_way:\{label:"Viaje directo",base:4000\},round_trip:\{label:"Ida y vuelta",base:6000\}\}/);
  assert.match(html, /fare=types\[selected\]\.base/);
  assert.doesNotMatch(html,/1200\+km\*800|data-type="confort"|data-type="xl"|\$ 3\.760/);
  assert.match(html,/espera; después \$250 por minuto iniciado/);
  assert.match(html,/No se realizan cobros ni se contacta a conductores/);
});
test("BM Viajes demo inline JavaScript syntax is valid", () => {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length > 0);
  for (const [,script] of scripts) if (script.trim()) new Function(script);
});
