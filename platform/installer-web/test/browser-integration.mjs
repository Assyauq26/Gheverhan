import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createHttpsServer, request as httpsRequest } from 'node:https';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createPool, migrate } from '../../installer/src/db.mjs';
import { createControlServer } from '../../installer/src/server.mjs';
import { hash } from '../../installer/src/common.mjs';
import { serveDashboard } from '../dashboard.mjs';
import { startPairingCli } from './cli-fixture.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { generateKeyPair, exportJWK, SignJWT, jwtVerify } = createRequire(new URL('../../installer/package.json', import.meta.url))('jose');

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
test(realCli ? 'real Go CLI preflight, HTTPS OIDC browser consent and durable PostgreSQL key-bound pairing' : 'HTTPS browser OIDC login, durable PostgreSQL intent and device pairing through real same-origin UI', { timeout: 150000 }, async t => {
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
  const providerKeys = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  const sessionKeys = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  const deviceSigner = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  const grants = new Map(); let issuer; let tokenExchanges = 0;
  const provider = createHttpsServer({ key, cert }, async (req, res) => {
    try {
      const url = new URL(req.url, issuer);
      if (req.method === 'GET' && url.pathname === '/authorize') {
        assert.equal(url.searchParams.get('client_id'), 'synthetic-browser-client');
        assert.equal(url.searchParams.get('response_type'), 'code'); assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
        const code = randomUUID(); grants.set(code, { nonce: url.searchParams.get('nonce'), challenge: url.searchParams.get('code_challenge') });
        const callback = new URL(url.searchParams.get('redirect_uri'));
        callback.searchParams.set('code', code); callback.searchParams.set('state', url.searchParams.get('state'));
        res.writeHead(302, { location: callback.href, 'Cache-Control': 'no-store' }); res.end(); return;
      }
      if (req.method === 'POST' && url.pathname === '/token') {
        const chunks = []; let bytes = 0;
        for await (const chunk of req) { bytes += chunk.length; if (bytes > 8192) throw new Error('Oversized fixture request'); chunks.push(chunk); }
        const body = new URLSearchParams(Buffer.concat(chunks).toString());
        const grant = grants.get(body.get('code')); assert.ok(grant); grants.delete(body.get('code'));
        assert.equal(body.get('grant_type'), 'authorization_code');
        assert.equal(Buffer.from(hash(body.get('code_verifier')), 'hex').toString('base64url'), grant.challenge);
        tokenExchanges++;
        const token = await new SignJWT({ nonce: grant.nonce, email_verified: true }).setProtectedHeader({ alg: 'EdDSA' })
          .setSubject('synthetic-browser-' + directory).setIssuer(issuer).setAudience('synthetic-browser-client').setIssuedAt().setExpirationTime('5m').sign(providerKeys.privateKey);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ id_token: token })); return;
      }
      res.writeHead(404); res.end();
    } catch { res.writeHead(400); res.end(); }
  });
  provider.listen(0, '127.0.0.1'); await once(provider, 'listening'); issuer = 'https://127.0.0.1:' + provider.address().port;
  t.after(() => new Promise(resolve => provider.close(resolve)));
  let control;
  const gateway = createHttpsServer({ key, cert }, (req, res) => control.emit('request', req, res));
  gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening'); const origin = 'https://127.0.0.1:' + gateway.address().port;
  t.after(() => new Promise(resolve => gateway.close(resolve)));
  const config = { controlOrigin: origin, signingKey: deviceSigner.privateKey, verificationKey: deviceSigner.publicKey,
    sessionIssuer: { issuer: origin, audience: 'jetseller-portal', jwks: { keys: [await exportJWK(sessionKeys.publicKey)] } },
    oidc: { issuer, clientId: 'synthetic-browser-client', authorizationEndpoint: issuer + '/authorize', tokenEndpoint: issuer + '/token', redirectUri: origin + '/auth/callback',
      jwks: { keys: [await exportJWK(providerKeys.publicKey)] }, sessionSigningKey: sessionKeys.privateKey } };
  control = createControlServer(config, pool, { oidcFetch: trustedFetch(cert), dashboard: serveDashboard });
  const browser = await chromium.launch({ headless: true }); t.after(() => browser.close());
  // This synthetic test certificate is not a deployment certificate or public ACME proof.
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(origin); await page.getByRole('link', { name: 'Masuk ke akun seller' }).click();
  await page.locator('#workspace:not([hidden])').waitFor(); assert.equal(tokenExchanges, 1);
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
  let cli, device;
  if (realCli) {
    cli = await startPairingCli(t, { directory, origin, installationId }); device = cli;
  } else {
    const agent = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    const deviceResponse = await context.request.post(origin + '/api/installer/v1/agent/pairing/device', { data: {
      installation_hint: installationId, public_key: await exportJWK(agent.publicKey), protocol_version: '1', os: 'ubuntu-24.04', arch: 'amd64', agent_version: '0.1.0',
    } });
    assert.equal(deviceResponse.status(), 201); device = await deviceResponse.json();
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
  assert.equal(await page.locator('#detail-version').textContent(), 'Belum terpasang');
  assert.equal(await page.locator('code').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  // The same real session cannot mutate without a matching CSRF token.
  const denied = await context.request.post(origin + '/api/installer/v1/installations', { headers: { Origin: origin }, data: {
    display_name: 'must not persist', domain: 'denied-' + randomUUID() + '.example', profile: 'fresh_vps_ubuntu_amd64', requested_install_version: 'stable',
  } });
  assert.equal(denied.status(), 403);
  await context.close();
});
