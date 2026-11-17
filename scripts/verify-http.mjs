import assert from 'node:assert/strict';
import fs from 'node:fs';
const base = 'http://127.0.0.1:3080';
const logs = ['logs/server.out.log', 'logs/server.err.log'].map(path => fs.readFileSync(path, 'utf8')).join('\n');
const urls = [...logs.matchAll(/http:\/\/127\.0\.0\.1:3080\/?\?token=[A-Za-z0-9_~.%-]+/g)];
assert.ok(urls.length, 'Authenticated launch URL missing from server log');
const exchange = await fetch(urls.at(-1)[0], { redirect: 'manual' });
assert.equal(exchange.status, 303);
const cookie = exchange.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
assert.ok(cookie);
const page = await fetch(base, { headers: { cookie } });
assert.equal(page.status, 200);
const html = await page.text();
assert.match(html, /<title>Naumi<\/title>/);
assert.match(html, /__NAUMI__/);
assert.match(html, /const preference = "light"/);
const assets = [...new Set([...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)].map(match => match[1]))];
assert.ok(assets.length, 'No built JS/CSS assets');
for (const asset of assets) {
  const response = await fetch(new URL(asset, base), { method: 'HEAD' });
  assert.equal(response.status, 200, asset);
}
const unauthorized = await fetch(`${base}/api/not-a-real-route`);
assert.equal(unauthorized.status, 401);
const authenticated = await fetch(`${base}/api/not-a-real-route`, { headers: { cookie } });
assert.equal(authenticated.status, 404);
console.log(`HTTP_SMOKE=PASS root=200 token_exchange=303 light_theme=1 assets=${assets.length} unauthorized=401 authenticated_unknown_route=404`);
