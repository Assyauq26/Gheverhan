// Synthetic browser contract/visual fixture only. Network is intercepted and
// blocked outside this origin. This is NOT live email delivery, VPS, TLS or provisioning proof.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const output = process.env.P0_WIZARD_EVIDENCE_DIR || fileURLToPath(new URL('evidence/p0-wizard/', import.meta.url));
await mkdir(output, { recursive: true });
const origin = 'https://portal.fixture.example';
const id = '550e8400-e29b-41d4-a716-446655440000';
const store = { installation_id: id, display_name: 'Toko Mandiri', domain: 'store.fixture.example', status: 'PAIRED' };
const instructions = { installation_id: id, available: true, release_id: 'rel-1.0.0-internal', installer: { url: 'https://release.fixture.example/setup', sha256: 'a'.repeat(64), signature_url: 'https://release.fixture.example/setup.sigstore.json' }, control_origin: origin, policy_url: 'https://release.fixture.example/policy.json', policy_sha256: 'b'.repeat(64), root_sha256: 'c'.repeat(64), manifest_sha256: 'd'.repeat(64) };
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    let phase = 'DATABASE', authenticated = false; const errors = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { await route.abort(); return; }
      const assets = { '/daftar': ['public/index.html','text/html'], '/': ['public/index.html', 'text/html'], '/assets/app.js': ['public/app.js', 'text/javascript'], '/assets/styles.css': ['public/styles.css', 'text/css'] };
      if (assets[url.pathname]) {
        const [file, type] = assets[url.pathname];
        await route.fulfill({ status: 200, contentType: type, body: await readFile(new URL(file, root)) }); return;
      }
      let data;
      if (url.pathname.endsWith('/session')) { if (!authenticated) { await route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:{code:'AUTH_REQUIRED'}})}); return; } data = { authenticated: true, csrf_token: 'synthetic-csrf' }; }
      else if (url.pathname === '/auth/status') data = {configured:true,method:'email_otp',login_url:'/masuk',registration_url:'/daftar'};
      else if (url.pathname === '/auth/email/start') { const input=route.request().postDataJSON(); assert.equal(input.mode,'register'); data={status:'OTP_SENT',challenge_id:'550e8400-e29b-41d4-a716-446655440099',expires_in:600,resend_after:60}; }
      else if (url.pathname === '/auth/email/verify') { assert.equal(route.request().postDataJSON().code,'123456'); authenticated=true; data={status:'AUTHENTICATED'}; }
      else if (url.pathname.endsWith('/installations')) data = { installations: [store] };
      else if (url.pathname.endsWith('/install-instructions')) data = instructions;
      else if (url.pathname.endsWith('/install-progress')) data = { installation_id: id, phase, sequence: 7, updated_at: '2026-11-04T00:00:00Z', store_origin: 'https://store.fixture.example' };
      else if (url.pathname.endsWith('/domain-challenges')) data = { challenge: null };
      else if (url.pathname.endsWith('/' + id)) data = { installation: store };
      if (!data) { await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_FOUND' } }) }); return; }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin+'/daftar'); await page.locator('#email-auth').waitFor({state:'visible'});
    await page.getByLabel('Nama Anda',{exact:true}).fill('Seller Fixture');await page.getByLabel('Nama toko pertama',{exact:true}).fill('Toko Mandiri');await page.getByLabel('Alamat email',{exact:true}).fill('seller@fixture.example');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);await page.screenshot({path:path.join(output,'register-'+width+'.png'),fullPage:true});
    await page.getByRole('button',{name:'Kirim kode verifikasi',exact:true}).click();await page.locator('#email-verify-form').waitFor({state:'visible'});await page.screenshot({path:path.join(output,'otp-'+width+'.png'),fullPage:true});
    await page.getByLabel('Kode 6 digit dari email',{exact:true}).fill('123456');await page.getByRole('button',{name:'Verifikasi dan lanjutkan',exact:true}).click();await page.locator('#workspace').waitFor({state:'visible'});
    assert.equal(await page.locator('#email-code').inputValue(),'');await page.locator('.installation-item').click();
    await page.locator('#installer-release').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.wizard-steps li').count(), 8);
    assert.equal(await page.locator('#local-admin').isVisible(), false);
    phase = 'LOCAL_READINESS'; await page.locator('#refresh-progress').click();
    await page.locator('#local-admin').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#local-admin').getAttribute('href'), 'https://store.fixture.example/admin/setup');
    assert.match(await page.locator('#install-command').textContent(), /--confirm-install 550e8400-e29b-41d4-a716-446655440000/);
    assert.doesNotMatch(await page.locator('body').innerText(), /JetSeller|siap live dalam|Toko siap berjualan/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    for (const locator of await page.locator('button:visible, a.button:visible, .wizard-steps a:visible').all()) {
      const box = await locator.boundingBox(); assert.ok(box && box.height >= 43.5, 'Visible action must be at least 44px tall');
    }
    await page.screenshot({ path: path.join(output, width + '.png'), fullPage: true });
    assert.deepEqual(errors, []); results.push({ width, result: 'PASS', scope: 'synthetic_browser_contract_only' });
    await context.close();
  }
} finally { await browser.close(); }
await writeFile(path.join(output, 'results.json'), JSON.stringify({ scope: 'synthetic_browser_contract_only', not_proven: ['live email delivery', 'PostgreSQL', 'VPS resources', 'installer execution', 'public TLS', 'product publication'], results }, null, 2) + '\n');
console.log(JSON.stringify(results));
