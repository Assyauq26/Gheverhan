import { lstat, realpath, access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

export function isHelipodIdentity(env) {
  if (env.GHEVERHAN_DEPLOYMENT_TARGET !== 'helipod' || env.GHEVERHAN_ALLOW_VPS_READ_ONLY !== '1' || env.STORAGE_PROVIDER !== 'local' || env.STORAGE_LOCAL_ROOT !== '/data/media' || env.APP_ORIGIN !== 'https://gheverhan.store' || env.GHEVERHAN_ISOLATED_TESTS === '1') return false;
  try {
    return ['DATABASE_URL', 'DIRECT_URL', 'PREFLIGHT_LEDGER_DATABASE_URL'].every(key => {
      const u = new URL(env[key]);
      return ['postgres:', 'postgresql:'].includes(u.protocol) && u.hostname === 'db' && (u.port || '5432') === '5432' && u.pathname === '/gheverhan' && (u.searchParams.get('schema') || 'public') === 'public' && u.username === (key === 'PREFLIGHT_LEDGER_DATABASE_URL' ? 'gheverhan' : 'gheverhan_runtime') && Boolean(u.password);
    });
  } catch { return false; }
}

export async function verifyLocalMedia(env) {
  try {
    const root = env.STORAGE_LOCAL_ROOT;
    if (root !== '/data/media' || process.getuid?.() !== 1000) throw new Error();
    const stat = await lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== 1000 || (stat.mode & 0o077) !== 0 || await realpath(root) !== root) throw new Error();
    await access(root, constants.R_OK | constants.W_OK | constants.X_OK);
    const mounts = await readFile('/proc/self/mountinfo', 'utf8');
    if (!mounts.split('\n').some(line => { const f = line.split(' '); return f[3] === '/opt/gheverhan/media' && f[4] === root && f[5].split(',').includes('rw'); })) throw new Error();
    return { status: 'PASS', reason: 'PRIVATE_PERSISTENT_LOCAL_MEDIA' };
  } catch { return { status: 'BLOCKED', reason: 'LOCAL_MEDIA_UNVERIFIED' }; }
}
