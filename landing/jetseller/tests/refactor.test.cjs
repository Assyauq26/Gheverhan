// Dependency-free integrity checks for the standalone JetSeller marketing page.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(base, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(base, 'assets/css/refactor.css'), 'utf8');
assert.match(html, /<html lang="id">/);
assert.match(html, /assets\/css\/refactor\.css/);
assert.match(css, /background-size:36px 36px/);
assert.match(css, /linear-gradient\(to right/);
assert.match(html, /class="hero-artwork"/);
assert.match(html, /hero-desktop\.png/);
assert.doesNotMatch(html, /class="(?:laptop|phone|shipping-truck)"/);
assert.match(html, /href="https:\/\/gheverhan\.store" target="_blank" rel="noopener noreferrer"/);
assert.match(html, /href="\/daftar\/"/);
assert.match(html, /href="\/masuk\/"/);
assert.match(html, /id="faq"/);
assert.match(css, /prefers-reduced-motion:reduce/);
assert.doesNotMatch(css, /url\(https?:/);
assert.doesNotMatch(html, /<script[^>]+src="https?:/);
for(const route of ['index.html','404.html','daftar/index.html','masuk/index.html']) {
  const page=fs.readFileSync(path.join(base,route),'utf8');
  assert.match(page,/rel="icon"[^>]+favicon\.svg\?v=wordmark-1/);
  assert.match(page,/rel="apple-touch-icon"[^>]+apple-touch-icon\.png\?v=wordmark-1/);
}
const icon=fs.readFileSync(path.join(base,'assets/img/favicon.svg'),'utf8');
assert.match(icon,/>Jet<\/tspan><tspan[^>]+>Seller<\/tspan>/);
assert.doesNotMatch(icon,/<path/);
assert(fs.statSync(path.join(base,'assets/img/apple-touch-icon.png')).size>0);
console.log('JetSeller V3 static page integrity: PASS');
