import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createHttpsServer, request as httpsRequest } from 'node:https';
import { once } from 'node:events';
import { randomUUID, createHash, X509Certificate } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createPool, migrate } from '../../installer/src/db.mjs';
import { createControlServer } from '../../installer/src/server.mjs';
import { serveDashboard } from '../dashboard.mjs';
import { startPairingCli } from './cli-fixture.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { generateKeyPair, exportJWK, jwtVerify } = createRequire(new URL('../../installer/package.json', import.meta.url))('jose');

/** Genuine HTTPS transport with the test certificate explicitly trusted. No
 * global TLS bypass and no substituted API/auth response handler. */
function trustedFetch(cert) {
  return (url, options = {}) => new Promise((resolve, reject) => {
    const request = httpsRequest(url, { method: options.method || 'GET', headers: options.headers, ca: cert,
      signal: options.signal, rejectUnauthorized: true }, response => {
      const chunks = []; let size = 0;
      response.on('data', chunk => { size += chunk.length; if (size > 32768) request.destroy(new Error('Oversized fixture response')); else chunks.push(chunk); });
      response.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers: response.headers })));
    });
    request.on('error', reject); request.end(options.body?.toString());
  });
}

const realCli = process.env.JETSELLER_PAIRING_E2E === '1';
test(realCli ? 'real Go CLI preflight, email OTP browser verification and PostgreSQL key-bound pairing' : 'HTTPS email OTP browser registration/login, PostgreSQL intent and device pairing through real same-origin UI', { timeout: 150000 }, async t => {
  const connection = process.env.JETSELLER_CONTROL_TEST_DATABASE_URL;
  if (process.env.JETSELLER_CONTROL_TEST_CONFIRM !== 'isolated-control-fixture' || !connection) throw new Error('Explicit isolated control fixture required');
  const database = new URL(connection);
  assert.equal(database.pathname, '/js_control_fixture'); assert.ok(['127.0.0.1', 'localhost'].includes(database.hostname));
  const pool = createPool(connection); t.after(() => pool.end()); await migrate(pool);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jetseller-browser-'));
  t.after(async () => {
    const absolute = path.resolve(directory);
    assert.equal(path.dirname(absolute), path.resolve(os.tmpdir())); assert.ok(path.basename(absolute).startsWith('jetseller-browser-'));
    await rm(absolute, { recursive: true, force: true });
  });
  execFileSync(process.env.JETSELLER_TEST_OPENSSL || 'openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', path.join(directory, 'key.pem'), '-out', path.join(directory, 'cert.pem')], { stdio: 'ignore' });
  const key = await readFile(path.join(directory, 'key.pem')), cert = await readFile(path.join(directory, 'cert.pem'));
  const localFetch = trustedFetch(cert);
  const sessionKeys = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  const deviceSigner = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  const email = 'browser-' + randomUUID() + '@fixture.example';
  let mailRequests = 0, lastCode = null, mailOrigin;
  // A real local HTTPS delivery transport, not live Resend/inbox delivery.
  // OTP remains only in test memory and is never logged or artifacted.
  const mail = createHttpsServer({ key, cert }, async (req, res) => {
    try {
      if (req.method !== 'POST' || new URL(req.url, mailOrigin).pathname !== '/emails') throw new Error('Invalid fixture route');
      const chunks = []; let bytes = 0;
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 16384) throw new Error('Oversized fixture mail'); chunks.push(chunk); }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      assert.ok(body.to.includes(email));
      const match = body.text.match(/: (\d{6})\n/); assert.ok(match, 'Six-digit email proof required');
      lastCode = match[1]; mailRequests++;
      res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify({id:randomUUID()}));
    } catch { res.writeHead(400); res.end(); }
  });
  mail.listen(0, '127.0.0.1'); await once(mail, 'listening'); mailOrigin = 'https://127.0.0.1:' + mail.address().port;
  t.after(() => new Promise(resolve => mail.close(resolve)));
  let control;
  const gateway = createHttpsServer({ key, cert }, (req, res) => control.emit('request', req, res));
  gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening'); const origin = 'https://127.0.0.1:' + gateway.address().port;
  t.after(() => new Promise(resolve => gateway.close(resolve)));
  const config = { controlOrigin: origin, signingKey: deviceSigner.privateKey, verificationKey: deviceSigner.publicKey,
    authMode:'email_otp',
    sessionIssuer: { issuer: origin, audience: 'jetseller-portal', jwks: { keys: [await exportJWK(sessionKeys.publicKey)] } },
    emailAuth: {resendApiKey:'synthetic-resend-key',otpPepper:'a'.repeat(64),from:'Buat Toko Online Sendiri <noreply@fixture.example>',sessionSigningKey:sessionKeys.privateKey} };
  let dnsPublished=false;
  control = createControlServer(config, pool, { domainLookup: async()=>dnsPublished, emailFetch: async (endpoint, options) => { assert.equal(endpoint,'https://api.resend.com/emails'); return trustedFetch(cert)(mailOrigin+'/emails', options); }, dashboard: serveDashboard });
  const spki = createHash('sha256').update(new X509Certificate(cert).publicKey.export({type:'spki',format:'der'})).digest('base64');
  const browser = await chromium.launch({ headless: true, args:['--ignore-certificate-errors-spki-list='+spki] }); t.after(() => browser.close());
  // This synthetic test certificate is not a deployment certificate or public ACME proof.
  const context = await browser.newContext({ ignoreHTTPSErrors: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(origin+'/daftar'); await page.locator('#email-auth:not([hidden])').waitFor();
  await page.getByLabel('Nama Anda',{exact:true}).fill('Browser Seller'); await page.getByLabel('Nama toko pertama',{exact:true}).fill('Synthetic Browser Store'); await page.getByLabel('Alamat email',{exact:true}).fill(email);
  await page.getByRole('button',{name:'Kirim kode verifikasi',exact:true}).click(); await page.locator('#email-verify-form:not([hidden])').waitFor();
  assert.equal(mailRequests,1); assert.ok(lastCode); await page.getByLabel('Kode 6 digit dari email',{exact:true}).fill(lastCode); lastCode=null;
  await page.getByRole('button',{name:'Verifikasi dan lanjutkan',exact:true}).click(); await page.locator('#workspace:not([hidden])').waitFor();
  assert.equal(new URL(page.url()).pathname,'/'); assert.equal(await page.locator('#email-auth').isVisible(),false); assert.equal(await page.locator('#email-code').inputValue(),'');
  const cookies = await context.cookies(origin); const sessionCookie = cookies.find(cookie => cookie.name === '__Host-js_portal_session');
  assert.ok(sessionCookie?.httpOnly && sessionCookie.secure); assert.equal(await page.evaluate(() => document.cookie.includes('__Host-js_portal_session')), false);
  const displayName = 'Synthetic Browser Store', domain = 'browser-' + randomUUID() + '.example';
  await page.getByLabel('Nama toko', { exact: true }).fill(displayName); await page.getByLabel('Domain toko', { exact: true }).fill(domain);
  await page.getByRole('button', { name: 'Buat rencana instalasi' }).click();
  await page.locator('#installation-detail:not([hidden])').waitFor();
  const installationId = await page.locator('#detail-id').textContent();
  const stored = (await pool.query('SELECT display_name,status,domain FROM installer.installations WHERE id=$1', [installationId])).rows[0];
  assert.deepEqual(stored, { display_name: displayName, status: 'DRAFT', domain });
  await page.reload(); await page.getByRole('button', { name: new RegExp(displayName) }).click();
  await page.getByRole('button',{name:'Buat instruksi TXT',exact:true}).click();
  await page.locator('#domain-proof-record:not([hidden])').waitFor();
  assert.equal(await page.locator('#domain-proof-name').textContent(),'_jetseller.'+domain);
  assert.match(await page.locator('#domain-proof-value').textContent(),/^jetseller-verification=[A-Za-z0-9_-]{43}$/);
  const pendingProof=page.waitForResponse(response=>response.url().endsWith('/verify')&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Periksa rekaman TXT',exact:true}).click();
  assert.equal((await pendingProof).status(),202);
  await page.waitForFunction(()=>document.querySelector('#domain-proof-verify').dataset.busy==='false');
  await page.locator('#domain-proof-status').filter({hasText:'Menunggu rekaman TXT'}).waitFor();
  dnsPublished=true;
  await page.getByRole('button',{name:'Periksa rekaman TXT',exact:true}).click();
  await page.locator('#domain-proof-status').filter({hasText:'Kendali domain terverifikasi'}).waitFor();
  assert.equal((await pool.query('SELECT status FROM installer.installations WHERE id=$1',[installationId])).rows[0].status,'DRAFT');

  let cli, device;
  if (realCli) {
    cli = await startPairingCli(t, { directory, origin, installationId }); device = cli;
  } else {
    const agent = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    const deviceResponse = await localFetch(origin + '/api/installer/v1/agent/pairing/device', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({
      installation_hint: installationId, public_key: await exportJWK(agent.publicKey), protocol_version: '1', os: 'ubuntu-24.04', arch: 'amd64', agent_version: '0.1.0',
    }) });
    assert.equal(deviceResponse.status, 201); device = await deviceResponse.json();
  }
  // Follow the exact verification URI printed by the Go installer, not a test-only root URL.
  assert.equal(new URL(device.verification_uri).pathname,'/hubungkan-server');
  const verification=await page.goto(device.verification_uri);assert.equal(verification.status(),200);
  await page.getByRole('button',{name:new RegExp(displayName)}).click();
  await page.getByLabel('Kode dari terminal VPS').fill(device.user_code); await page.getByRole('button', { name: 'Periksa kode' }).click();
  await page.locator('#pairing-confirm:not([hidden])').waitFor();
  if (realCli) assert.equal(await page.locator('#device-fingerprint').textContent(), cli.thumbprint);
  assert.equal((await page.content()).includes(device.device_code), false);
  await page.getByLabel(/Saya mengenali VPS/).check(); await page.getByRole('button', { name: 'Setujui penghubungan VPS' }).click();
  await page.locator('#detail-status').filter({ hasText: 'VPS terhubung' }).waitFor();
  assert.equal((await pool.query('SELECT status FROM installer.installations WHERE id=$1', [installationId])).rows[0].status, 'PAIRED');
  if (realCli) {
    const completed=await cli.complete();
    const bound=(await pool.query('SELECT id,thumbprint FROM installer.devices WHERE installation_id=$1 AND revoked_at IS NULL',[installationId])).rows;
    assert.equal(bound.length,1);assert.equal(bound[0].id,completed.credential.device_id);assert.equal(bound[0].thumbprint,cli.thumbprint);
    const verified=await jwtVerify(completed.credential.credential,deviceSigner.publicKey,{issuer:origin,audience:'jetseller-agent-management'});
    assert.equal(verified.payload.installation_id,installationId);assert.equal(verified.payload.cnf.jkt,cli.thumbprint);
    assert.equal((await page.content()).includes(completed.credential.credential),false);
  }
  assert.equal(await page.locator('#detail-version').textContent(), 'Belum ada versi terlapor');
  assert.equal(await page.locator('code').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  // The same real session cannot mutate without a matching CSRF token.
  const denied = await localFetch(origin + '/api/installer/v1/installations', { method:'POST', headers:{Origin:origin,'content-type':'application/json',Cookie:'__Host-js_portal_session='+sessionCookie.value}, body:JSON.stringify({
    display_name: 'must not persist', domain: 'denied-' + randomUUID() + '.example', profile: 'fresh_vps_ubuntu_amd64', requested_install_version: 'stable',
  }) });
  assert.equal(denied.status, 403);
  const priorSession = await jwtVerify(sessionCookie.value,sessionKeys.publicKey,{issuer:origin,audience:'jetseller-portal'});
  await page.getByRole('button',{name:'Keluar',exact:true}).click(); await page.locator('#email-auth:not([hidden])').waitFor();
  assert.ok((await pool.query('SELECT revoked_at FROM installer.sessions WHERE id=$1',[priorSession.payload.sid])).rows[0].revoked_at);
  const revoked = await localFetch(origin+'/api/installer/v1/session',{headers:{Cookie:'__Host-js_portal_session='+sessionCookie.value}}); assert.equal(revoked.status,401);
  await page.getByLabel('Alamat email',{exact:true}).fill(email);
  // Pin this owned fixture's cooldown to now so slow CI cannot skip the denial.
  await pool.query('UPDATE installer.email_challenges SET created_at=now() WHERE email=$1',[email]);
  const limited = page.waitForResponse(response=>response.url().endsWith('/auth/email/start')&&response.status()===429);
  await page.getByRole('button',{name:'Kirim kode verifikasi',exact:true}).click(); await limited;
  await page.locator('#email-auth-error').filter({hasText:'Terlalu banyak percobaan'}).waitFor();
  // Advance only this synthetic fixture's cooldown row; production keeps 60s.
  await pool.query("UPDATE installer.email_challenges SET created_at=now()-interval '61 seconds' WHERE email=$1",[email]);
  await page.getByRole('button',{name:'Kirim kode verifikasi',exact:true}).click(); await page.locator('#email-verify-form:not([hidden])').waitFor();
  assert.equal(mailRequests,2); assert.ok(lastCode);
  const wrong = lastCode === '000000' ? '111111' : '000000'; await page.getByLabel('Kode 6 digit dari email',{exact:true}).fill(wrong); await page.getByRole('button',{name:'Verifikasi dan lanjutkan',exact:true}).click();
  await page.locator('#email-auth-error').filter({hasText:'Kode belum cocok'}).waitFor(); assert.equal(await page.locator('#workspace').isVisible(),false);
  await page.getByLabel('Kode 6 digit dari email',{exact:true}).fill(lastCode); lastCode=null; await page.getByRole('button',{name:'Verifikasi dan lanjutkan',exact:true}).click(); await page.locator('#workspace:not([hidden])').waitFor();
  assert.equal(await page.locator('#email-code').inputValue(),''); assert.equal(await page.locator('.installation-item').count(),1);
  await context.close();
});
