import { readFileSync, lstatSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function loadPrivateConfig(file, mode = 'runtime') {
  const st = lstatSync(file);
  if (!st.isFile() || st.isSymbolicLink() || st.size > 16384 || (process.platform !== 'win32' && (st.mode & 0o007))) throw new Error('Invalid private configuration');
  const config = JSON.parse(readFileSync(file, 'utf8'));
  const allowed = new Set(['JETSELLER_STORE_PROFILE', 'JETSELLER_INSTALLATION_MODE', 'JETSELLER_INSTALLATION_ID', 'JETSELLER_STORE_DOMAIN', 'APP_ORIGIN', 'STORAGE_PROVIDER', 'STORAGE_APP_NAME', 'STORAGE_LOCAL_ROOT', 'DATABASE_URL', 'JWT_SECRET', 'AUTH_COOKIE_NAME', 'PASSWORD_RESET_FROM', 'PASSWORD_RESET_BASE_URL', 'JETSELLER_MIGRATION_IDENTITY', 'RESEND_API_KEY']);
  if (mode === 'migration') allowed.add('DIRECT_URL');
  if (!config || Array.isArray(config) || typeof config !== 'object' || Object.entries(config).some(([k,v]) => !allowed.has(k) || typeof v !== 'string' || /[\x00-\x1f\x7f]/.test(v))) throw new Error('Invalid private configuration');
  if (mode === 'runtime' && config.DIRECT_URL) throw new Error('Migration secret forbidden in runtime');
  return config;
}

async function main() {
  const migration = process.argv[2] === 'migrate';
  const config = loadPrivateConfig(migration ? '/run/secrets/migration_config' : '/run/secrets/runtime_config', migration ? 'migration' : 'runtime');
  // Do not inherit platform integration secrets from an unrelated host environment.
  const env = { PATH: process.env.PATH, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', HOSTNAME: '0.0.0.0', PORT: '3000', ...config };
  const { parseSelfHostedConfig } = await import('./config.mjs');
  parseSelfHostedConfig(env);
  if (!migration) {
    const { assertExistingLocalStorageRoot } = await import('./storage-root.mjs');
    assertExistingLocalStorageRoot(env.STORAGE_LOCAL_ROOT);
  }
  const args = migration ? ['node_modules/prisma/build/index.js', 'migrate', 'deploy'] : ['node_modules/next/dist/bin/next', 'start', '-H', '0.0.0.0', '-p', '3000'];
  const child = spawn(process.execPath, args, { env, stdio: 'inherit' });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
  child.on('error', () => { console.error('Self-hosted process failed'); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('Self-hosted startup validation failed'); process.exitCode = 1; });
