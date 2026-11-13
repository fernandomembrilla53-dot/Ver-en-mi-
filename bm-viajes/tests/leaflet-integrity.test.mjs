import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Official Leaflet 1.9.4 hashes: https://leafletjs.com/install.html
const expected = [
  "href=\"https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css\" integrity=\"sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=\" crossorigin=\"anonymous\"",
  "src=\"https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js\" integrity=\"sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=\" crossorigin=\"anonymous\""
];
for (const page of ['index.html', 'piloto.html']) {
  test(page + ' pins Leaflet CDN script and stylesheet integrity', () => {
    const html = readFileSync(new URL('../' + page, import.meta.url), 'utf8');
    for (const asset of expected) assert.ok(html.includes(asset), asset);
    assert.ok(!html.includes('unpkg.com/leaflet'));
  });
}
