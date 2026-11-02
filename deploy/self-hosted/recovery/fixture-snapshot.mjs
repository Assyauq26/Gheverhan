#!/usr/bin/env node
/** Synthetic fixture snapshots only. This is not a seller backup agent. */
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MARKER = '.jetseller-disposable.json';
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_FILES = 4096;
const MAGIC = Buffer.from('JSSF1');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const safeError = () => new Error('Fixture snapshot operation refused');
const inside = (parent, child) => child === parent || child.startsWith(parent + path.sep);

async function realDirectory(directory) {
  const resolved = path.resolve(directory);
  let current = path.parse(resolved).root;
  for (const part of resolved.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw safeError();
  }
  return resolved;
}

async function privateFile(filename, maxBytes) {
  await realDirectory(path.dirname(filename));
  const stat = await fs.lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) throw safeError();
  const handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    if (opened.ino !== stat.ino || opened.dev !== stat.dev || opened.size > maxBytes) throw safeError();
    const data = await handle.readFile();
    if (data.length > maxBytes) throw safeError();
    return data;
  } finally { await handle.close(); }
}

async function exclusiveWrite(filename, bytes) {
  const handle = await fs.open(filename, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}

export async function initFixture(directory) {
  await realDirectory(path.dirname(path.resolve(directory)));
  await fs.mkdir(directory, { mode: 0o700 }); // Existing roots are deliberately rejected.
  const marker = { format: 1, purpose: 'jetseller-synthetic-disposable', fixtureId: randomUUID() };
  await exclusiveWrite(path.join(directory, MARKER), JSON.stringify(marker));
  await fs.mkdir(path.join(directory, 'media'), { mode: 0o700 });
  await fs.mkdir(path.join(directory, 'recovery'), { mode: 0o700 });
  return marker;
}

async function fixtureMarker(directory) {
  const root = await realDirectory(directory);
  const marker = JSON.parse((await privateFile(path.join(root, MARKER), 2048)).toString('utf8'));
  if (marker.format !== 1 || marker.purpose !== 'jetseller-synthetic-disposable' ||
      !/^[a-f0-9-]{36}$/.test(marker.fixtureId)) throw safeError();
  return { root, marker };
}

async function encryptionKey(filename, forbiddenRoots) {
  const resolved = path.resolve(filename);
  if (forbiddenRoots.some(root => inside(root, resolved))) throw safeError();
  const stat = await fs.lstat(resolved);
  if (process.platform !== 'win32' && (stat.mode & 0o077)) throw safeError();
  const bytes = await privateFile(resolved, 32);
  if (bytes.length !== 32) throw safeError();
  return bytes;
}

function validName(name) {
  return typeof name === 'string' && name.length <= 512 &&
    /^(?:database\.sql|(?:media|recovery)\/[A-Za-z0-9_. /-]+)$/.test(name) &&
    name.split('/').every(part => part && part !== '.' && part !== '..') && !name.endsWith('/');
}

async function inventory(root) {
  const files = [];
  let total = 0;
  async function visit(relative) {
    const absolute = path.join(root, relative);
    const stat = await fs.lstat(absolute);
    if (stat.isSymbolicLink()) throw safeError();
    if (stat.isDirectory()) {
      for (const entry of (await fs.readdir(absolute)).sort()) await visit(relative + '/' + entry);
    } else {
      if (!stat.isFile() || !validName(relative) || files.length >= MAX_FILES) throw safeError();
      if (stat.size > MAX_BYTES - total) throw safeError();
      const data = await privateFile(absolute, MAX_BYTES - total);
      total += data.length;
      files.push({ name: relative, sha256: hash(data), data: data.toString('base64') });
    }
  }
  await visit('database.sql');
  await visit('media');
  await visit('recovery');
  if (!files.some(file => file.name.startsWith('recovery/')) ||
      files.find(file => file.name === 'database.sql')?.data.length === 0) throw safeError();
  // Unknown top-level paths may contain unintended credentials; never silently include them.
  const top = (await fs.readdir(root)).sort();
  if (top.join('|') !== [MARKER, 'database.sql', 'media', 'recovery'].sort().join('|')) throw safeError();
  return { files, total };
}

export async function backupFixture(source, archive, keyFile) {
  const started = performance.now();
  const { root, marker } = await fixtureMarker(source);
  const output = path.resolve(archive);
  const parent = await realDirectory(path.dirname(output));
  if (inside(root, output) || inside(parent, root) || path.resolve(keyFile) === output) throw safeError();
  const key = await encryptionKey(keyFile, [root]);
  const { files, total } = await inventory(root);
  const payload = Buffer.from(JSON.stringify({ format: 1, sourceFixtureId: marker.fixtureId, files }));
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(MAGIC);
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  await exclusiveWrite(output, Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), encrypted]));
  key.fill(0);
  payload.fill(0);
  return { files: files.length, plaintextBytes: total, encryptedBytes: encrypted.length + 33,
    durationMs: Math.round(performance.now() - started), archiveSha256: hash(await privateFile(output, MAX_BYTES * 2)) };
}

function decodePayload(bytes) {
  const payload = JSON.parse(bytes.toString('utf8'));
  if (payload.format !== 1 || !/^[a-f0-9-]{36}$/.test(payload.sourceFixtureId) ||
      !Array.isArray(payload.files) || payload.files.length > MAX_FILES) throw safeError();
  const names = new Set();
  let total = 0;
  for (const file of payload.files) {
    if (!validName(file.name) || names.has(file.name) || typeof file.data !== 'string' ||
        file.data.length > Math.ceil(MAX_BYTES / 3) * 4) throw safeError();
    names.add(file.name);
    const data = Buffer.from(file.data, 'base64');
    if (data.toString('base64') !== file.data) throw safeError();
    total += data.length;
    if (total > MAX_BYTES || hash(data) !== file.sha256) throw safeError();
  }
  if (!names.has('database.sql') || ![...names].some(name => name.startsWith('recovery/')) ||
      payload.files.find(file => file.name === 'database.sql')?.data.length === 0) throw safeError();
  // Reject file/directory collisions before writing anything.
  for (const name of names) {
    const parts = name.split('/');
    for (let i = 1; i < parts.length; i++) if (names.has(parts.slice(0, i).join('/'))) throw safeError();
  }
  return payload;
}

export async function restoreFixture(archive, target, keyFile) {
  const started = performance.now();
  const destination = path.resolve(target);
  await realDirectory(path.dirname(destination));
  if (inside(destination, path.resolve(archive))) throw safeError();
  const key = await encryptionKey(keyFile, [destination]);
  const packed = await privateFile(path.resolve(archive), MAX_BYTES * 2);
  if (packed.length < 33 || !packed.subarray(0, 5).equals(MAGIC)) throw safeError();
  const decipher = createDecipheriv('aes-256-gcm', key, packed.subarray(5, 17));
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(packed.subarray(17, 33));
  const plain = Buffer.concat([decipher.update(packed.subarray(33)), decipher.final()]);
  const payload = decodePayload(plain);
  // Decryption, authentication and full path/checksum validation precede target creation.
  const marker = await initFixture(destination);
  for (const file of payload.files) {
    const filename = path.join(destination, ...file.name.split('/'));
    await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
    await realDirectory(path.dirname(filename));
    await exclusiveWrite(filename, Buffer.from(file.data, 'base64'));
  }
  const restored = await inventory(destination);
  for (const file of restored.files) {
    if (payload.files.find(item => item.name === file.name)?.sha256 !== file.sha256) throw safeError();
  }
  key.fill(0); plain.fill(0);
  return { fixtureId: marker.fixtureId, sourceFixtureId: payload.sourceFixtureId, files: restored.files.length,
    plaintextBytes: restored.total, durationMs: Math.round(performance.now() - started), checksumsMatch: true };
}

export async function verifyFixture(directory) {
  await fixtureMarker(directory);
  const { files, total } = await inventory(path.resolve(directory));
  return { files: files.map(({ name, sha256 }) => ({ name, sha256 })), plaintextBytes: total };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [operation, ...args] = process.argv.slice(2);
  try {
    let result;
    if (operation === 'init' && args.length === 1) result = await initFixture(args[0]);
    else if (operation === 'backup' && args.length === 3) result = await backupFixture(...args);
    else if (operation === 'restore' && args.length === 3) result = await restoreFixture(...args);
    else if (operation === 'verify' && args.length === 1) result = await verifyFixture(args[0]);
    else throw safeError();
    console.log(JSON.stringify(result));
  } catch {
    console.error('Fixture snapshot failed; inspect disposable inputs and permissions locally.');
    process.exitCode = 1;
  }
}
