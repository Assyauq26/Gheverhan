import { mkdirSync, writeFileSync, copyFileSync, cpSync, existsSync, lstatSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export function prepareFixture(target, { domain, appImage, migrationImage }) {
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(domain) || domain.length > 200 || domain === 'gheverhan.store' || domain.endsWith('.gheverhan.store')) throw new Error('Invalid disposable domain');
  for (const image of [appImage, migrationImage]) if (!/^(?:[a-z0-9./:_-]+@)?sha256:[a-f0-9]{64}$/.test(image)) throw new Error('Immutable image digest required');
  if (existsSync(target)) throw new Error('Refusing existing fixture destination');
  const parent = path.dirname(path.resolve(target));
  if (lstatSync(parent).isSymbolicLink()) throw new Error('Invalid fixture parent');
  mkdirSync(target, { mode: 0o700 });
  const privateDir = path.join(target, 'private'); mkdirSync(privateDir, { mode: 0o700 });
  const id = randomUUID(), database = 'js_' + id.replaceAll('-', '');
  const secret = () => randomBytes(32).toString('hex');
  const bootstrap = secret(), migration = secret(), runtime = secret();
  const config = {
    JETSELLER_STORE_PROFILE: 'self-hosted', JETSELLER_INSTALLATION_MODE: 'new',
    JETSELLER_INSTALLATION_ID: id, JETSELLER_STORE_DOMAIN: domain, APP_ORIGIN: 'https://' + domain,
    STORAGE_PROVIDER: 'local', STORAGE_APP_NAME: 'js_' + id.slice(0,8), STORAGE_LOCAL_ROOT: '/var/lib/jetseller/media',
    DATABASE_URL: `postgresql://js_runtime:${runtime}@db:5432/${database}?schema=public`,
    JETSELLER_MIGRATION_IDENTITY: 'js_migrate', JWT_SECRET: secret(), AUTH_COOKIE_NAME: 'js_' + id.slice(0,8) + '_session',
    PASSWORD_RESET_FROM: `Toko <noreply@${domain}>`, PASSWORD_RESET_BASE_URL: 'https://' + domain,
  };
  for (const [name, data] of Object.entries({ bootstrap_password: bootstrap, migration_password: migration, runtime_password: runtime, 'runtime.json': JSON.stringify(config), 'migration.json': JSON.stringify({ ...config, DIRECT_URL: `postgresql://js_migrate:${migration}@db:5432/${database}?schema=public` }) })) {
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
    else if (process.argv[2] === 'fixture' && process.argv.length === 7) prepareFixture(path.resolve(process.argv[3]), { domain:process.argv[4],appImage:process.argv[5],migrationImage:process.argv[6] });
    else throw new Error('Expected context destination or fixture destination domain app-digest migration-digest');
    console.log('Disposable preparation complete; private values omitted');
  } catch { console.error('Disposable preparation refused'); process.exitCode=1; }
}
