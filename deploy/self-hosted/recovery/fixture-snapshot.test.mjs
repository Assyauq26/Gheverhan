import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { backupFixture, initFixture, restoreFixture, verifyFixture } from './fixture-snapshot.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jetseller-recovery-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  const archiveDir = path.join(root, 'archives');
  await fs.mkdir(archiveDir);
  const archive = path.join(archiveDir, 'snapshot.enc');
  const key = path.join(root, 'key');
  await fs.writeFile(key, randomBytes(32), { mode: 0o600 });
  await initFixture(source);
  await fs.writeFile(path.join(source, 'database.sql'), '-- Synthetic fixture only\nCREATE TABLE synthetic_orders(id int);\nINSERT INTO synthetic_orders VALUES (42);\n');
  await fs.writeFile(path.join(source, 'media', 'synthetic.txt'), 'synthetic-media-sentinel');
  await fs.writeFile(path.join(source, 'recovery', 'config.json'), JSON.stringify({ syntheticSecret: 'synthetic-config-sentinel' }));
  return { root, source, archive, key, target: path.join(root, 'restored') };
}

test('authenticated encryption restores distinct fixture and exact DB/media/config checksums', async t => {
  const f = await fixture(t);
  const before = await verifyFixture(f.source);
  const result = await backupFixture(f.source, f.archive, f.key);
  const packed = await fs.readFile(f.archive);
  for (const sentinel of ['synthetic-media-sentinel', 'synthetic-config-sentinel', 'synthetic_orders']) {
    assert.equal(packed.includes(Buffer.from(sentinel)), false);
  }
  assert.equal(result.files, 3);
  const restored = await restoreFixture(f.archive, f.target, f.key);
  assert.equal(restored.checksumsMatch, true);
  assert.notEqual(restored.fixtureId, restored.sourceFixtureId);
  assert.deepEqual(await verifyFixture(f.target), before);
  assert.deepEqual(await verifyFixture(f.source), before);
  if (process.platform !== 'win32') assert.equal((await fs.stat(f.archive)).mode & 0o077, 0);
});

test('tampered ciphertext fails before target creation and does not expose plaintext errors', async t => {
  const f = await fixture(t);
  await backupFixture(f.source, f.archive, f.key);
  const bytes = await fs.readFile(f.archive); bytes[bytes.length - 1] ^= 1;
  await fs.writeFile(f.archive, bytes);
  await assert.rejects(restoreFixture(f.archive, f.target, f.key));
  await assert.rejects(fs.stat(f.target), { code: 'ENOENT' });
});

test('wrong key fails before target creation', async t => {
  const f = await fixture(t);
  await backupFixture(f.source, f.archive, f.key);
  await fs.writeFile(f.key, randomBytes(32));
  await assert.rejects(restoreFixture(f.archive, f.target, f.key));
  await assert.rejects(fs.stat(f.target), { code: 'ENOENT' });
});

test('existing archive and restore destination are never overwritten', async t => {
  const f = await fixture(t);
  await backupFixture(f.source, f.archive, f.key);
  const original = await fs.readFile(f.archive);
  await assert.rejects(backupFixture(f.source, f.archive, f.key));
  assert.deepEqual(await fs.readFile(f.archive), original);
  await fs.mkdir(f.target);
  await fs.writeFile(path.join(f.target, 'keep'), 'must survive');
  await assert.rejects(restoreFixture(f.archive, f.target, f.key));
  assert.equal(await fs.readFile(path.join(f.target, 'keep'), 'utf8'), 'must survive');
});

test('source sentinel, dump, key size, and allowlisted top-level layout are mandatory', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.source, 'unexpected.env'), 'sentinel');
  await assert.rejects(backupFixture(f.source, f.archive, f.key));
  await fs.unlink(path.join(f.source, 'unexpected.env'));
  await fs.unlink(path.join(f.source, '.jetseller-disposable.json'));
  await assert.rejects(backupFixture(f.source, f.archive, f.key));
});

test('key inside snapshot, missing dump and archive/source overlap are refused', async t => {
  const f = await fixture(t);
  const insideKey = path.join(f.source, 'recovery', 'key');
  await fs.copyFile(f.key, insideKey);
  await assert.rejects(backupFixture(f.source, f.archive, insideKey));
  await fs.unlink(insideKey);
  await assert.rejects(backupFixture(f.source, path.join(f.source, 'snapshot.enc'), f.key));
  await fs.unlink(path.join(f.source, 'database.sql'));
  await assert.rejects(backupFixture(f.source, f.archive, f.key));
});

test('short keys and broad Unix key permissions are refused', async t => {
  const f = await fixture(t);
  await fs.writeFile(f.key, Buffer.alloc(16));
  await assert.rejects(backupFixture(f.source, f.archive, f.key));
  if (process.platform !== 'win32') {
    await fs.writeFile(f.key, randomBytes(32)); await fs.chmod(f.key, 0o644);
    await assert.rejects(backupFixture(f.source, f.archive, f.key));
  }
});

test('missing recovery configuration and empty database dump are refused', async t => {
  const f = await fixture(t);
  await fs.unlink(path.join(f.source, 'recovery', 'config.json'));
  await assert.rejects(backupFixture(f.source, f.archive, f.key));
  await fs.writeFile(path.join(f.source, 'recovery', 'config.json'), '{}');
  await fs.writeFile(path.join(f.source, 'database.sql'), '');
  await assert.rejects(backupFixture(f.source, f.archive, f.key));
});

test('authenticated malicious paths and checksum mismatches are rejected before writes', async t => {
  const f = await fixture(t);
  const key = await fs.readFile(f.key);
  const data = Buffer.from('synthetic');
  for (const [index, name, checksum] of [[0, '../escape', createHash('sha256').update(data).digest('hex')], [1, 'database.sql', '0'.repeat(64)]]) {
    const payload = Buffer.from(JSON.stringify({ format: 1, sourceFixtureId: '11111111-1111-4111-8111-111111111111',
      files: [{ name, sha256: checksum, data: data.toString('base64') }] }));
    const nonce = randomBytes(12); const magic = Buffer.from('JSSF1');
    const cipher = createCipheriv('aes-256-gcm', key, nonce); cipher.setAAD(magic);
    const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
    const archive = f.archive + index;
    await fs.writeFile(archive, Buffer.concat([magic, nonce, cipher.getAuthTag(), encrypted]));
    await assert.rejects(restoreFixture(archive, f.target, f.key));
    await assert.rejects(fs.stat(f.target), { code: 'ENOENT' });
  }
});

test('symlink media entry or parent is refused', { skip: process.platform === 'win32' ? 'Requires Unix symlink fixture' : false }, async t => {
  const f = await fixture(t);
  await fs.symlink(f.key, path.join(f.source, 'media', 'leak'));
  await assert.rejects(backupFixture(f.source, f.archive, f.key));
  await fs.unlink(path.join(f.source, 'media', 'leak'));
  const alias = path.join(f.root, 'alias'); await fs.symlink(f.source, alias);
  await assert.rejects(backupFixture(alias, f.archive, f.key));
});

test('multi-megabyte media roundtrip stays below bounded-stack validation limits', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.source, 'media', 'large.bin'), randomBytes(4 * 1024 * 1024));
  const expected = await verifyFixture(f.source);
  await backupFixture(f.source, f.archive, f.key);
  await restoreFixture(f.archive, f.target, f.key);
  assert.deepEqual(await verifyFixture(f.target), expected);
});
