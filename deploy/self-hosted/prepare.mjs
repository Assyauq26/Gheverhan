import { mkdirSync, writeFileSync, copyFileSync, cpSync, existsSync, lstatSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const canonicalUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Only builds a disposable fixture. A future verified installer must pass the
 * UUID of the seller-owned installation already created by the control plane;
 * generating an unrelated UUID would break account/device/store binding.
 *
 * Passing installationId here does not attest seller ownership. Production
 * must verify the signed installation manifest and device pairing first.
 */
export function prepareFixture(target, { domain, appImage, migrationImage, installationId }) {
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(domain) || domain.length > 200 || domain === 'gheverhan.store' || domain.endsWith('.gheverhan.store')) throw new Error('Invalid disposable domain');
  for (const image of [appImage, migrationImage]) if (!/^(?:[a-z0-9./:_-]+@)?sha256:[a-f0-9]{64}$/.test(image)) throw new Error('Immutable image digest required');
  if (installationId !== undefined && !canonicalUUID.test(installationId)) throw new Error('Invalid canonical installation ID');
  if (existsSync(target)) throw new Error('Refusing existing fixture destination');
  const parent = path.dirname(path.resolve(target));
  if (lstatSync(parent).isSymbolicLink()) throw new Error('Invalid fixture parent');
  mkdirSync(target, { mode: 0o700 });
  const privateDir = path.join(target, 'private'); mkdirSync(privateDir, { mode: 0o700 });
  const id = installationId ?? randomUUID(), database = 'js_' + id.replaceAll('-', '');
  const secret = () => randomBytes(32).toString('hex');
  const bootstrap = secret(), migration = secret(), runtime = secret();
  // Each independent store receives its own J&T AES-GCM key. The central
  // portal and one-time migration process do not require carrier secrets.
  const jntEncryptionKey = randomBytes(32).toString('base64');
  const config = {
    JETSELLER_STORE_PROFILE: 'self-hosted', JETSELLER_INSTALLATION_MODE: 'new',
    JETSELLER_INSTALLATION_ID: id, JETSELLER_STORE_DOMAIN: domain, APP_ORIGIN: 'https://' + domain,
    STORAGE_PROVIDER: 'local', STORAGE_APP_NAME: 'js_' + id.slice(0,8), STORAGE_LOCAL_ROOT: '/var/lib/jetseller/media',
    DATABASE_URL: `postgresql://js_runtime:${runtime}@db:5432/${database}?schema=public`,
    JETSELLER_MIGRATION_IDENTITY: 'js_migrate', JWT_SECRET: secret(), AUTH_COOKIE_NAME: 'js_' + id.slice(0,8) + '_session',
    PASSWORD_RESET_FROM: `Toko <noreply@${domain}>`, PASSWORD_RESET_BASE_URL: 'https://' + domain,
    JNT_CONFIG_SCOPE: 'local_store', JNT_INTEGRATION_ENCRYPTION_KEY: jntEncryptionKey,
  };
  const migrationConfig = { ...config };
  delete migrationConfig.JNT_CONFIG_SCOPE;
  delete migrationConfig.JNT_INTEGRATION_ENCRYPTION_KEY;
  for (const [name, data] of Object.entries({ bootstrap_password: bootstrap, migration_password: migration, runtime_password: runtime, 'runtime.json': JSON.stringify(config), 'migration.json': JSON.stringify({ ...migrationConfig, DIRECT_URL: `postgresql://js_migrate:${migration}@db:5432/${database}?schema=public` }) })) {
    writeFileSync(path.join(privateDir, name), data + '\n', { mode: 0o600, flag: 'wx' });
  }
  for (const name of ['compose.yml','Caddyfile','init-db.sh','grant-runtime.sh']) copyFileSync(path.join(here,name),path.join(target,name));
  writeFileSync(path.join(target,'.env'), `COMPOSE_PROJECT_NAME=jsfixture_${id.slice(0,8)}\nJETSELLER_DATABASE_NAME=${database}\nJETSELLER_INSTALLATION_ID=${id}\nJETSELLER_STORE_DOMAIN=${domain}\nJETSELLER_APP_IMAGE=${appImage}\nJETSELLER_MIGRATION_IMAGE=${migrationImage}\n`, {mode:0o600,flag:'wx'});
  writeFileSync(path.join(target,'.jetseller-disposable'),JSON.stringify({ version:1,installation:id,production:false })+'\n',{mode:0o600,flag:'wx'});
  return { installationId:id, databaseName:database };
}

export function prepareBuildContext(target) {
  if (existsSync(target)) throw new Error('Refusing existing build destination');
  const frontend = path.resolve(here,'../../frontend');
  cpSync(frontend,target,{recursive:true,filter(source) {
    const relative = path.relative(frontend,source), segments=relative.split(path.sep);
    const normalized = relative.replaceAll(path.sep,'/');
    const sourceCoverage = normalized === 'src/app/admin/shipping/coverage' || normalized.startsWith('src/app/admin/shipping/coverage/');
    return !segments.some(s => ['node_modules','.next','.git','playwright-report','test-results'].includes(s) || (s === 'coverage' && !sourceCoverage) || s.startsWith('.env') || /\.(pem|key|p12|pfx)$/.test(s) || s === '.npmrc' || s === 'credentials.json');
  }});
  mkdirSync(path.join(target,'self-hosted'), {mode:0o755});
  chmodSync(path.join(target,'self-hosted'),0o755);
  copyFileSync(path.join(here,'launch.mjs'),path.join(target,'self-hosted/launch.mjs'));
  copyFileSync(path.join(here,'Dockerfile'),path.join(target,'Dockerfile'));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === 'context') prepareBuildContext(path.resolve(process.argv[3]));
    else if (process.argv[2] === 'fixture' && [7,8].includes(process.argv.length))
      prepareFixture(path.resolve(process.argv[3]), {
        domain: process.argv[4], appImage: process.argv[5], migrationImage: process.argv[6],
        ...(process.argv.length === 8 ? { installationId: process.argv[7] } : {}),
      });
    else throw new Error('Expected context destination or fixture destination domain app-digest migration-digest [canonical-installation-id]');
    console.log('Disposable preparation complete; private values omitted');
  } catch { console.error('Disposable preparation refused'); process.exitCode=1; }
}
