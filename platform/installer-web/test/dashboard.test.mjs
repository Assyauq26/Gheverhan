import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
const { JSDOM } = createRequire(import.meta.url)('jsdom');
import { createApi, mountDashboard, safeErrorMessage, statusLabel } from '../public/app.js';
import { serveDashboard } from '../dashboard.mjs';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const installation = { installation_id: 'ins_synthetic_1', display_name: '<img src=x onerror=alert(1)>', domain: 'synthetic.example', status: 'DRAFT', app_version: null, last_heartbeat_at: null };
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
const wait = () => new Promise(resolve => setTimeout(resolve, 10));

async function setup(t, route) {
  const dom = new JSDOM(html, { url: 'https://portal.fixture.example' });
  t.after(() => dom.window.close());
  const calls = [];
  const fetcher = async (url, options) => { calls.push({ url, options }); return route(url, options); };
  const app = mountDashboard(dom.window.document, fetcher);
  await app.start();
  return { dom, document: dom.window.document, calls };
}

test('same-origin client sends CSRF and idempotency only in headers, never URL', async () => {
  let call;
  const api = createApi(async (url, options) => { call = { url, options }; return response({ installation }); }, () => 'synthetic-csrf');
  await api('/installations', { method: 'POST', body: { domain: 'synthetic.example' }, idempotencyKey: 'synthetic-id' });
  assert.equal(call.options.headers['X-CSRF-Token'], 'synthetic-csrf');
  assert.equal(call.options.headers['Idempotency-Key'], 'synthetic-id');
  assert.equal(call.options.credentials, 'same-origin'); assert.equal(call.options.mode, 'same-origin');
  assert.equal(call.url.includes('csrf'), false);
});

test('missing identity provider and unauthenticated sessions never enable workspace', async t => {
  for (const [code, status] of [['AUTH_UNAVAILABLE', 503], ['AUTH_REQUIRED', 401]]) {
    const fixture = await setup(t, () => response({ error: { code } }, status));
    assert.equal(fixture.document.getElementById('workspace').hidden, true);
    assert.equal(fixture.document.getElementById('notice-message').textContent, safeErrorMessage(code));
    assert.equal(fixture.calls.length, 2);
  }
});

test('login link appears only for configured fixed same-origin identity entry point', async t => {
  for (const [login, visible] of [['/auth/login', true], ['https://attacker.invalid/login', false]]) {
    const fixture = await setup(t, url => url === '/auth/status' ? response({ configured: true, login_url: login }) : response({ error: { code: 'AUTH_REQUIRED' } }, 401));
    assert.equal(fixture.document.getElementById('sign-in').hidden, !visible);
    assert.equal(fixture.document.getElementById('workspace').hidden, true);
  }
});

test('server data renders as text; uninstalled and unknown states never imply ready to sell', async t => {
  const fixture = await setup(t, url => url.endsWith('/session') ? response({ authenticated: true, csrf_token: 'synthetic-csrf' }) : url.endsWith('/installations') ? response({ installations: [installation] }) : response({ installation }));
  fixture.document.querySelector('.installation-item').click(); await wait();
  assert.equal(fixture.document.getElementById('detail-name').textContent, installation.display_name);
  assert.equal(fixture.document.getElementById('detail-name').querySelector('img'), null);
  assert.equal(fixture.document.getElementById('detail-version').textContent, 'Belum terpasang');
  assert.match(fixture.document.getElementById('detail-explanation').textContent, /belum dipasang/);
  assert.equal(statusLabel('UNREVIEWED_SUCCESS'), 'Status belum tersedia');
  assert.equal(fixture.document.querySelector('code'), null);
});

test('create intent preserves idempotency after network loss and uses real response', async t => {
  let createCount = 0;
  const fixture = await setup(t, (url, options) => {
    if (url.endsWith('/session')) return response({ authenticated: true, csrf_token: 'synthetic-csrf' });
    if (options.method === 'POST') { if (++createCount === 1) throw new Error('private upstream DSN must not render'); return response({ installation }); }
    if (url.endsWith('/installations')) return response({ installations: createCount > 1 ? [installation] : [] });
    return response({ installation });
  });
  fixture.document.getElementById('store-name').value = 'Synthetic'; fixture.document.getElementById('store-domain').value = 'synthetic.example';
  const form = fixture.document.getElementById('create-form');
  form.dispatchEvent(new fixture.dom.window.Event('submit', { bubbles: true, cancelable: true })); await wait();
  assert.equal(fixture.document.getElementById('create-error').textContent.includes('DSN'), false);
  form.dispatchEvent(new fixture.dom.window.Event('submit', { bubbles: true, cancelable: true })); await wait();
  const posts = fixture.calls.filter(call => call.options.method === 'POST');
  assert.equal(posts.length, 2); assert.equal(posts[0].options.headers['Idempotency-Key'], posts[1].options.headers['Idempotency-Key']);
  assert.equal(fixture.document.getElementById('installation-detail').hidden, false);
});

test('a device for another installation cannot expose confirmation or approve pairing', async t => {
  const fixture = await setup(t, (url, options) => {
    if (url.endsWith('/session')) return response({ authenticated: true, csrf_token: 'synthetic-csrf' });
    if (url.endsWith('/lookup')) return response({ installation_id: 'other-installation', pairing_session_id: 'pair_other', public_key_thumbprint: 'synthetic-public-thumbprint', scopes: ['release:read'], status: 'PENDING' });
    if (url.endsWith('/installations')) return response({ installations: [installation] });
    return response({ installation });
  });
  fixture.document.querySelector('.installation-item').click(); await wait();
  fixture.document.getElementById('pairing-code').value = 'ABCD-EFGH';
  fixture.document.getElementById('pairing-form').dispatchEvent(new fixture.dom.window.Event('submit', { bubbles: true, cancelable: true })); await wait();
  assert.equal(fixture.document.getElementById('pairing-confirm').hidden, true);
  assert.equal(fixture.document.getElementById('device-fingerprint').textContent, '');
  assert.equal(fixture.calls.some(call => call.url.endsWith('/approve')), false);
});

test('real pairing contract requires confirmation and refreshes authoritative detail', async t => {
  let paired = false;
  const fixture = await setup(t, (url, options) => {
    if (url.endsWith('/session')) return response({ authenticated: true, csrf_token: 'synthetic-csrf' });
    if (url.endsWith('/lookup')) return response({ installation_id: installation.installation_id, pairing_session_id: 'pair_synthetic', public_key_thumbprint: 'synthetic-public-thumbprint', scopes: ['release:read'], status: 'PENDING' });
    if (url.endsWith('/approve')) { paired = true; assert.deepEqual(JSON.parse(options.body), { user_code: 'ABCD-EFGH', public_key_thumbprint: 'synthetic-public-thumbprint', confirm: true }); return response({ installation_id: installation.installation_id, status: 'PAIRED' }); }
    if (url.endsWith('/installations')) return response({ installations: [{ ...installation, status: paired ? 'PAIRED' : 'DRAFT' }] });
    return response({ installation: { ...installation, status: paired ? 'PAIRED' : 'DRAFT' } });
  });
  fixture.document.querySelector('.installation-item').click(); await wait();
  fixture.document.getElementById('pairing-code').value = 'ABCD-EFGH';
  fixture.document.getElementById('pairing-form').dispatchEvent(new fixture.dom.window.Event('submit', { bubbles: true, cancelable: true })); await wait();
  assert.equal(fixture.document.getElementById('pairing-confirm').hidden, false);
  fixture.document.getElementById('confirm-device').checked = true;
  fixture.document.getElementById('pairing-confirm').dispatchEvent(new fixture.dom.window.Event('submit', { bubbles: true, cancelable: true })); await wait();
  assert.equal(paired, true); assert.equal(fixture.document.getElementById('detail-status').textContent, 'VPS terhubung');
  assert.match(fixture.document.getElementById('detail-explanation').textContent, /belum membuktikan/);
  assert.equal(fixture.document.getElementById('pairing-code').value, '');
  assert.equal(fixture.document.getElementById('device-fingerprint').textContent, '');
});

test('static HTTP handler has fixed allowlist and same-origin CSP', async t => {
  const server = createServer(async (req, res) => { if (!await serveDashboard(req, res)) { res.writeHead(404); res.end(); } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const origin = 'http://127.0.0.1:' + server.address().port;
  const page = await fetch(origin); assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /connect-src 'self'/);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  const pairingPage=await fetch(origin+'/hubungkan-server');assert.equal(pairingPage.status,200);assert.equal(await pairingPage.text(),html);
  assert.equal((await fetch(origin + '/PRODUCT.md')).status, 404);
  assert.equal((await fetch(origin + '/api/installer/v1/session')).status, 404);
});
