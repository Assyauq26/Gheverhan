const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(base, 'daftar/index.html'), 'utf8');
const js = fs.readFileSync(path.join(base, 'assets/js/registration.js'), 'utf8');
const css = fs.readFileSync(path.join(base, 'assets/css/registration.css'), 'utf8');
test('registration keeps shared header and footer and has four named steps', () => {
  const login = fs.readFileSync(path.join(base, 'masuk/index.html'), 'utf8');
  assert.equal(html.match(/<header[\s\S]*?<\/header>/)[0].replace(' aria-current="page"', ''), login.match(/<header[\s\S]*?<\/header>/)[0].replace(' aria-current="page"', ''));
  assert.equal(html.match(/<footer[\s\S]*?<\/footer>/)[0], login.match(/<footer[\s\S]*?<\/footer>/)[0]);
  assert.equal((html.match(/data-panel="[1-4]"/g) || []).length, 4);
  assert.match(html, /Plus\+Jakarta\+Sans/);
  assert.match(html, /Pratinjau pendaftaran/);
});
test('default form fails closed and browser never submits sensitive fields', () => {
  assert.match(html, /<fieldset id="registration-fields" disabled>/);
  assert.doesNotMatch(html, /<(?:input|select)[^>]+\bname=/);
  assert.match(js, /event\.preventDefault\(\)/);
  assert.doesNotMatch(js, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie|console\.|\.submit\s*\(/);
  assert.match(js, /window\.addEventListener\("pagehide", clearSensitive\)/);
});
test('simulation is loopback opt-in and cannot grant real success', () => {
  assert.match(js, /\["localhost", "127\.0\.0\.1", "\[::1\]"\]\.includes\(location\.hostname\)/);
  assert.match(js, /get\("preview"\) === "1"/);
  assert.match(html, /id="dashboard" disabled/);
  assert.match(html, /id="verify" type="button" disabled/);
  assert.doesNotMatch(js, /location\.(?:href|assign|replace)\s*[=(]/);
});
test('scoped visual and accessible form contracts', () => {
  assert.match(css, /#E1251B/); assert.match(css, /#111418/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /focus-visible/);
  for (const id of ['owner', 'email', 'phone', 'password', 'confirm', 'brand', 'slug', 'otp']) {
    assert.match(html, new RegExp('for="' + id + '"'));
    assert.match(html, new RegExp('id="' + id + '-error"'));
  }
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Ketersediaan nama toko belum diperiksa/);
});
