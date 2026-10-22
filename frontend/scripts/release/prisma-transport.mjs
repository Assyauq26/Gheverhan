/** Protected process-local Prisma 5.22 CA binding; never logs input or mutates stored secrets. */
import { X509Certificate } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
export class TransportConfigurationError extends Error {
  constructor(reason) { super('Protected transport configuration blocked'); this.reason = reason; }
}
const block = reason => { throw new TransportConfigurationError(reason); };
export function inspectRuntimeBinding(raw) {
  try {
    const u = new URL(raw), ref = 'bztprltkevacidcpjaam';
    if (!['postgres:', 'postgresql:'].includes(u.protocol) || u.pathname !== '/postgres' || (u.searchParams.get('schema') || 'public') !== 'public') block('TARGET_UNVERIFIED');
    if (!u.username || u.hash || new Set(u.searchParams.keys()).size !== [...u.searchParams.keys()].length) block('DSN_PARAMETERS_INVALID');
    decodeURIComponent(u.password);
    if (u.searchParams.get('sslmode') !== 'require' || u.searchParams.get('sslaccept') !== 'strict') block('STRICT_TLS_REQUIRED');
    // Prisma 5.22 ignores libpq sslrootcert; never mistake it for a configured CA.
    if (u.searchParams.has('sslrootcert') || u.searchParams.has('sslidentity') || u.searchParams.has('sslpassword')) block('TLS_PARAMETERS_UNSUPPORTED');
    const port = u.port || '5432';
    if (u.hostname === `db.${ref}.supabase.co` && port === '5432') return 'direct';
    if (u.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(u.username).endsWith(`.${ref}`) && ['5432','6543'].includes(port)) return port === '6543' ? 'transaction-pooler' : 'session-pooler';
    block('TARGET_UNVERIFIED');
  } catch (error) { if (error instanceof TransportConfigurationError) throw error; block('DSN_PARAMETERS_INVALID'); }
}
export function parseDatabaseCa(raw) {
  if (!raw?.trim()) block('CA_MISSING');
  if (raw.length > 100000) block('CA_INVALID');
  let pem = raw.trim();
  if (!pem.startsWith('-----BEGIN CERTIFICATE-----')) {
    if (!/^[A-Za-z0-9+/=\s]+$/.test(pem)) block('CA_INVALID');
    pem = Buffer.from(pem, 'base64').toString('utf8').trim();
  }
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  if (!blocks?.length || blocks.length > 8 || pem.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, '').trim()) block('CA_INVALID');
  try {
    for (const cert of blocks) {
      const ca = new X509Certificate(cert);
      if (!ca.ca || Date.now() < Date.parse(ca.validFrom) || Date.now() > Date.parse(ca.validTo)) block('CA_INVALID');
    }
  } catch { block('CA_INVALID'); }
  return blocks.join('\n') + '\n';
}
// Exported separately for isolated TLS tests; Production entrypoints validate target first.
export function bindPrismaCa(urls, rawCa) {
  const pem = parseDatabaseCa(rawCa);
  const directory = mkdtempSync(path.join(tmpdir(), 'gheverhan-prisma-ca-'));
  const certificatePath = path.join(directory, 'db-ca.pem');
  try {
    writeFileSync(certificatePath, pem, {mode:0o600, flag:'wx'});
    const connections = urls.map(({name,url,mode}) => {
      const parsed = new URL(url);
      if (parsed.searchParams.has('sslcert')) block('UNMANAGED_CA_PATH');
      parsed.searchParams.set('sslcert', certificatePath);
      return {name,mode,url:parsed.toString()};
    });
    return {connections, cleanup:()=>rmSync(directory,{recursive:true,force:true})};
  } catch (error) { rmSync(directory,{recursive:true,force:true}); throw error; }
}
export function prepareProductionTransport(env) {
  if (!env.DATABASE_URL || !env.DIRECT_URL) block('MISSING_PROTECTED_OPERATOR_BINDINGS');
  const runtime = inspectRuntimeBinding(env.DATABASE_URL), direct = inspectRuntimeBinding(env.DIRECT_URL);
  if (direct === 'transaction-pooler') block('DIRECT_URL_TRANSACTION_POOLER_NOT_ALLOWED');
  return bindPrismaCa([{name:'runtime',url:env.DATABASE_URL,mode:runtime},{name:'direct',url:env.DIRECT_URL,mode:direct}],env.SUPABASE_DB_CA_CERT);
}
