// Dependency-free integrity checks for the standalone JetSeller marketing page.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(base, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(base, 'assets/css/refactor.css'), 'utf8');
const mainCss = fs.readFileSync(path.join(base, 'assets/css/main.css'), 'utf8');
assert.match(mainCss, /a, button, summary, \[role="button"\]\s*\{\s*-webkit-tap-highlight-color:\s*transparent;/);
assert.match(mainCss, /\.faq summary\s*\{\s*-webkit-user-select:\s*none;\s*user-select:\s*none;/);
assert.match(mainCss, /summary:focus-visible/);
assert.match(html, /<html lang="id">/);
assert.match(html, /assets\/css\/refactor\.css/);
assert.match(css, /background-size:36px 36px/);
assert.match(css, /linear-gradient\(to right/);
assert.match(html, /class="hero-artwork"/);
assert.match(html, /hero-self-hosted\.svg/);
assert.doesNotMatch(html, /class="(?:laptop|phone|shipping-truck)"/);
assert.match(html, /href="https:\/\/gheverhan\.store" target="_blank" rel="noopener noreferrer"/);
assert.match(html, /href="\/pendaftaran"/);
assert.doesNotMatch(html, /href="\/masuk\/"/);
assert.match(html, /id="faq"/);
assert.doesNotMatch(html, /Apakah JetSeller sama dengan Gheverhan\?/);
assert.equal((html.match(/<summary>/g) || []).length, 7, 'Seven Git Clone FAQ entries must be present');
assert.match(css, /prefers-reduced-motion:reduce/);
assert.doesNotMatch(css, /url\(https?:/);
assert.doesNotMatch(html, /<script[^>]+src="https?:/);
for(const route of ['index.html','404.html']) {
  const page=fs.readFileSync(path.join(base,route),'utf8');
  assert.match(page,/rel="icon"[^>]+favicon\.svg\?v=identity-2/);
  assert.match(page,/rel="apple-touch-icon"[^>]+apple-touch-icon\.png\?v=identity-2/);
}
const icon=fs.readFileSync(path.join(base,'assets/img/favicon.svg'),'utf8');
assert.match(icon,/Buat Toko Online Sendiri/);
assert.doesNotMatch(icon,/JetSeller/);
assert(fs.statSync(path.join(base,'assets/img/apple-touch-icon.png')).size>0);
console.log('JetSeller V3 static page integrity: PASS');
