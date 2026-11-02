import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const docker = args => execFileSync('docker', ['--host', 'unix:///var/run/docker.sock', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
const imagePattern = /^ubuntu@sha256:[a-f0-9]{64}$/;

/** Real CLI in a fresh Ubuntu namespace: no host Docker socket, Caddy or
 * PostgreSQL files are visible, so the production preflight is not bypassed.
 * The named state volume belongs solely to this disposable test. */
export async function startPairingCli(t, { directory, origin, installationId }) {
  assert.equal(process.platform, 'linux', 'CLI container fixture requires Ubuntu CI');
  const binary = process.env.JETSELLER_PAIRING_CLI_BINARY;
  const image = process.env.JETSELLER_PAIRING_CLI_IMAGE;
  assert.ok(path.isAbsolute(binary ?? '') && !binary.includes(','), 'Explicit built CLI required');
  const stat = await lstat(binary); assert.ok(stat.isFile() && !stat.isSymbolicLink());
  assert.match(image ?? '', imagePattern, 'Pinned Ubuntu fixture image required');
  const fixtureId = randomUUID(), name = 'js-pair-e2e-' + fixtureId, volume = name + '-state';
  docker(['volume', 'create', '--label', 'jetseller.pairing-fixture=' + fixtureId, volume]);
  const certificate = path.join(directory, 'cert.pem');
  const common = ['--network', 'host', '--read-only', '--label', 'jetseller.pairing-fixture=' + fixtureId,
    '--mount', `type=bind,source=${binary},target=/candidate/jetseller-setup,readonly`,
    '--mount', `type=bind,source=${certificate},target=/candidate/ca.pem,readonly`,
    '--mount', `type=volume,source=${volume},target=/state`,
    '--env', 'SSL_CERT_FILE=/candidate/ca.pem', image, '/candidate/jetseller-setup'];
  const flags = ['--state', '/state/private', '--installation-id', installationId, '--control-origin', origin];
  const child = spawn('docker', ['--host', 'unix:///var/run/docker.sock', 'run', '--name', name, ...common, 'pair', ...flags], { stdio: ['ignore', 'pipe', 'pipe'] });
  const stopped = new Promise(resolve => { child.once('error', () => resolve(null)); child.once('close', code => resolve(code)); });
  // Human code/fingerprint are read only into test memory, never logged/artifacted.
  let terminal = ''; child.stderr.on('data', () => {});
  const session = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Real CLI did not reach private pairing checkpoint')), 45000);
    child.stdout.on('data', data => {
      terminal += data.toString();
      if (terminal.length > 16384) { clearTimeout(timeout); reject(new Error('Unexpected CLI output size')); return; }
      const match = terminal.match(/Open (https:\/\/\S+) and enter ([A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5})\. Confirm device fingerprint ([A-Za-z0-9_-]{43})\./);
      if (match) { clearTimeout(timeout); resolve({ verification_uri: match[1], user_code: match[2], thumbprint: match[3] }); }
    });
    stopped.then(() => { clearTimeout(timeout); reject(new Error('CLI exited before pairing checkpoint')); });
  });
  t.after(() => {
    try {
      const label = docker(['inspect', name, '--format', '{{index .Config.Labels "jetseller.pairing-fixture"}}']).trim();
      if (label === fixtureId) docker(['stop', name]);
    } catch { /* The runner owns disposable resource disposal, never prune host data. */ }
  });
  const human = await session; assert.equal(new URL(human.verification_uri).origin, origin);
  const pending = path.join(directory, 'private-pairing-checkpoint.json');
  docker(['cp', name + ':/state/private/pairing.json', pending]);
  const privateSession = JSON.parse(await readFile(pending, 'utf8'));
  assert.equal(privateSession.user_code, human.user_code);
  return {
    ...human, device_code: privateSession.device_code,
    async complete() {
      let timeout;
      const code = await Promise.race([stopped, new Promise(resolve => { timeout = setTimeout(() => resolve(null), 45000); })]);
      clearTimeout(timeout); assert.equal(code, 0, 'Real CLI must finish after seller consent');
      assert.ok(terminal.includes('Device paired; local store deployment remains gated.'));
      const state = path.join(directory, 'private-completed-state'); await mkdir(state, { mode: 0o700 });
      docker(['cp', name + ':/state/private/.', state]);
      for (const file of ['identity.json', 'credential.json', 'journal.json']) {
        const info = await lstat(path.join(state, file)); assert.ok(info.isFile() && !info.isSymbolicLink());
        assert.equal(info.mode & 0o077, 0, 'Persisted CLI state must remain private');
      }
      const identity = JSON.parse(await readFile(path.join(state, 'identity.json'), 'utf8'));
      const credential = JSON.parse(await readFile(path.join(state, 'credential.json'), 'utf8'));
      const journal = JSON.parse(await readFile(path.join(state, 'journal.json'), 'utf8'));
      assert.equal(identity.installation_id, installationId); assert.equal(journal.phase, 'PAIRED');
      assert.equal(credential.installation_id, installationId); assert.equal(credential.public_key_thumbprint, human.thumbprint);
      assert.equal(credential.local_control_origin, origin);
      await assert.rejects(lstat(path.join(state, 'pairing.json')), { code: 'ENOENT' });
      // A real CLI restart must retain the same binding, not create a new device.
      const resumeName = name + '-resume';
      t.after(() => { try { if (docker(['inspect', resumeName, '--format', '{{index .Config.Labels "jetseller.pairing-fixture"}}']).trim() === fixtureId) docker(['stop', resumeName]); } catch {} });
      const resumed = docker(['run', '--name', resumeName, ...common, 'resume-pairing', ...flags]);
      assert.ok(resumed.includes('Device binding recorded locally; credential refresh may be required.'));
      terminal = '';
      return { credential, journal };
    },
  };
}
