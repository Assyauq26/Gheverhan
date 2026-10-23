/** Real, disposable provider drill. No cloud resource or Production secrets required. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const exec = promisify(execFile);
const storageImage = 'supabase/storage-api@sha256:98ffec5d0678803783c30e404c27f4ec65e97efbe014088f2a86b4b8b54b9f54';
const postgresImage = 'postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24';
const id = 'gheverhan-storage-' + randomUUID();
const db = id + '-db', api = id + '-api';
const directory = await mkdtemp(path.join(tmpdir(), 'gheverhan-storage-'));
const secret = randomBytes(32).toString('hex'), password = randomBytes(24).toString('hex');
const enc = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = role => {
  const body = enc({ alg: 'HS256', typ: 'JWT' }) + '.' + enc({ role, iss: 'supabase', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600 });
  return body + '.' + createHmac('sha256', secret).update(body).digest('base64url');
};
const service = jwt('service_role');
let phase = 'docker readiness', networkCreated = false;
// Preserve configured proxy/CA defaults and registry credentials. Force the local
// managed Docker socket so inherited contexts cannot target a remote daemon.
const docker = (...args) => exec('docker', ['--host=unix:///var/run/docker.sock', ...args], {
  env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'].includes(k))),
  timeout: 300000, maxBuffer: 16 * 1024 * 1024,
});
try {
  await docker('info', '--format', '{{.ServerVersion}}');
  phase = 'pinned provider image pull';
  await docker('pull', storageImage);
  await docker('pull', postgresImage);
  phase = 'isolated network';
  await docker('network', 'create', id); networkCreated = true;
  const dbEnv = path.join(directory, 'postgres.env');
  await writeFile(dbEnv, `POSTGRES_PASSWORD=${password}\nPOSTGRES_DB=storage_drill\n`, { mode: 0o600 });
  const apiEnv = path.join(directory, 'storage.env');
  await writeFile(apiEnv, Object.entries({
    DATABASE_URL: `postgresql://postgres:${password}@${db}:5432/storage_drill`,
    DB_INSTALL_ROLES: 'true', AUTH_JWT_SECRET: secret, ANON_KEY: jwt('anon'), SERVICE_KEY: service,
    STORAGE_BACKEND: 'file', FILE_STORAGE_BACKEND_PATH: '/var/lib/storage', TENANT_ID: 'local-drill',
    REGION: 'local', GLOBAL_S3_BUCKET: 'local', ENABLE_IMAGE_TRANSFORMATION: 'false', S3_PROTOCOL_ENABLED: 'false', SERVER_PORT: '5000',
  }).map(([k,v]) => `${k}=${v}\n`).join(''), { mode: 0o600 });
  phase = 'disposable PostgreSQL';
  await docker('run', '-d', '--name', db, '--network', id, '--tmpfs', '/var/lib/postgresql/data:rw,size=384m', '--env-file', dbEnv, postgresImage);
  for (let n=0; ; n++) {
    try { await docker('exec', db, 'pg_isready', '-U', 'postgres', '-d', 'storage_drill'); break; }
    catch { if (n >= 60) throw new Error(); await new Promise(r => setTimeout(r, 500)); }
  }
  phase = 'disposable Storage API container';
  await docker('run', '-d', '--name', api, '--network', id, '--tmpfs', '/var/lib/storage:rw,size=64m', '--tmpfs', '/tmp:rw,size=64m', '-p', '127.0.0.1::5000', '--env-file', apiEnv, storageImage);
  phase = 'loopback port discovery';
  const { stdout } = await docker('port', api, '5000/tcp');
  const binding = stdout.trim();
  if (!/^127\.0\.0\.1:\d+$/.test(binding)) throw new Error();
  const origin = 'http://' + binding;
  phase = 'provider health';
  for (let n=0; ; n++) {
    try { const r=await fetch(origin+'/status', {signal:AbortSignal.timeout(1000)}); if(!r.ok) throw new Error(); break; }
    catch { if(n >= 60) throw new Error(); await new Promise(r=>setTimeout(r,500)); }
  }
  phase = 'application helper/provider contract';
  const result = await exec(process.execPath, ['--import','tsx','tests/integration/private-storage-provider.ts'], {
    env: { ...process.env, GHEVERHAN_ISOLATED_TESTS: '1', GHEVERHAN_PRIVATE_STORAGE_ORIGIN: origin, GHEVERHAN_PRIVATE_STORAGE_SERVICE_KEY: service }, timeout: 60000,
  });
  // Child emits counts/booleans only, never provider bodies or credentials.
  process.stdout.write(result.stdout);
} catch {
  console.error(`Private Storage provider drill BLOCKED/FAILED at ${phase}; no Production operation performed. Inspect disposable provider locally without exporting credentials.`);
  process.exitCode = 1;
} finally {
  let cleanupFailed = false;
  for (const name of [api, db]) {
    try { await docker('rm','-f','-v',name); }
    catch { // Container may not have been created when an earlier phase failed.
      try { await docker('inspect',name); cleanupFailed = true; } catch { /* absent */ }
    }
  }
  if (networkCreated) try { await docker('network','rm',id); } catch { cleanupFailed = true; }
  await rm(directory, {recursive:true,force:true});
  if(cleanupFailed) { console.error('Disposable resource cleanup incomplete; operator must inspect named drill resources.'); process.exitCode=1; }
}
