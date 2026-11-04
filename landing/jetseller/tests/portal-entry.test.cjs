const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolvePortalEntry, mountPortalEntry } = require('../assets/js/portal-entry.js');
const origin = 'https://dashboard.buattokosendiri.web.id';
const config = { enabled: true, portal_origin: origin, auto_redirect: true };
const status = { configured: true, method:'email_otp', login_url: '/masuk', registration_url: '/daftar' };
const response = data => ({ ok: true, json: async () => data });
function document(action) {
  const message = { textContent: '' }, link = { hidden: true, href: '', removeAttribute() { this.href = ''; } };
  return { body: { dataset: { portalAction: action } }, getElementById: id => id === 'portal-entry-status' ? message : id === 'portal-entry-link' ? link : null, message, link };
}
test('entry resolution pins the official portal and exact provider capability', () => {
  assert.equal(resolvePortalEntry(config, status, 'register'), origin + '/daftar');
  assert.equal(resolvePortalEntry(config, status, 'login'), origin + '/masuk');
  for (const [settings, state, action] of [
    [{ ...config, enabled: false }, status, 'login'],
    [{ ...config, portal_origin: 'https://attacker.invalid' }, status, 'login'],
    [config, { ...status, configured: false }, 'register'],
    [config, { ...status, registration_url: 'https://attacker.invalid' }, 'register'],
    [config, status, 'unsupported'],
  ]) assert.equal(resolvePortalEntry(settings, state, action), null);
});
test('disabled release configuration does not contact the portal or redirect', async () => {
  const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../portal-config.json'), 'utf8'));
  assert.equal(settings.enabled, false);
  const page = document('register'), calls = [], destinations = [];
  await mountPortalEntry(page, async (url, options) => { calls.push({ url, options }); return response(settings); }, value => destinations.push(value));
  assert.equal(calls.length, 1); assert.equal(calls[0].url, '/portal-config.json');
  assert.equal(page.link.hidden, true); assert.deepEqual(destinations, []);
});
test('redirect is credentialless and waits for real configured auth capability', async () => {
  const page = document('register'), calls = [], destinations = [];
  await mountPortalEntry(page, async (url, options) => { calls.push({ url, options }); return response(url.startsWith('/') ? config : status); }, value => destinations.push(value));
  assert.equal(calls.length, 2); assert.equal(calls[1].url, origin + '/auth/status');
  assert.equal(calls[1].options.credentials, 'omit'); assert.equal(calls[1].options.mode, 'cors');
  assert.equal(calls[1].options.redirect, 'error'); assert.equal(page.link.hidden, false);
  assert.deepEqual(destinations, [origin + '/daftar']);
});
test('network or unverified capability fails closed without exposing upstream diagnostics', async () => {
  for (const capability of [null, { configured: false }, { ...status, login_url: 'javascript:alert(1)' }]) {
    const page = document('login'), destinations = [];
    await mountPortalEntry(page, async url => { if (url.startsWith('/')) return response(config); if (!capability) throw new Error('private upstream token'); return response(capability); }, value => destinations.push(value));
    assert.equal(page.link.hidden, true); assert.equal(page.link.href, ''); assert.deepEqual(destinations, []);
    assert.match(page.message.textContent, /belum dapat dikonfirmasi/); assert.doesNotMatch(page.message.textContent, /token/);
  }
});
