/** Operator-only metadata probe. Run from frontend with protected process bindings.
 * No credential retrieval, URL logging, customer reads, migrations or writes.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
const ref = 'bztprltkevacidcpjaam';
export const inspectRuntimeBinding = raw => {
  const u = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(u.protocol) || u.pathname !== '/postgres' || (u.searchParams.get('schema') || 'public') !== 'public') throw new Error();
  if (!u.username || u.hash || new Set(u.searchParams.keys()).size !== [...u.searchParams.keys()].length) throw new Error('Unverified binding');
  const port = u.port || '5432';
  let mode;
  if (u.hostname === `db.${ref}.supabase.co` && port === '5432') mode = 'direct';
  else if (u.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(u.username).endsWith(`.${ref}`) && ['5432','6543'].includes(port)) mode = port === '6543' ? 'transaction-pooler' : 'session-pooler';
  else throw new Error();
  // Do not connect if a strict TLS transport policy cannot be proven locally.
  if (u.searchParams.get('sslmode') !== 'require' || u.searchParams.get('sslaccept') !== 'strict') throw new Error();
  return mode;
};
// Diagnostic fields are strict enums. Never emit Prisma message, stack, URL, host or user.
const knownPrismaCodes = new Set(['P1000','P1001','P1002','P1003','P1008','P1010','P1011','P1017','P2010','P2024','P2028','P2034']);
const knownSqlStates = new Set(['28P01','28000','42501','42P01','42883','08006','08P01','53300','57014','0A000']);
const knownPhases = new Set(['PRISMA_INIT','CONNECT','START_TRANSACTION','SET_READ_ONLY','SET_TIMEOUT','IDENTITY_METADATA','TABLE_GRANTS_METADATA','CONNECTION_CHECK','DISCONNECT','UNEXPECTED']);
export const safeProbeFailure = (error, phase, connection) => {
  let rawCode, rawState;
  try { rawCode = error?.code; rawState = error?.meta?.code; } catch { /* malformed error object */ }
  return {
    status:'BLOCKED',
    reason:'RUNTIME_PROBE_FAILED',
    connection:connection==='direct'?'direct':'runtime',
    phase:knownPhases.has(phase)?phase:'UNEXPECTED',
    prismaCode:knownPrismaCodes.has(rawCode)?rawCode:'UNCLASSIFIED',
    sqlState:knownSqlStates.has(rawState)?rawState:'UNCLASSIFIED',
    readOnly:true
  };
};

async function main() {
  if (Number(process.versions.node.split(".")[0]) !== 22) throw new Error();
  if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) {
    console.log(JSON.stringify({status:'BLOCKED',reason:'MISSING_PROTECTED_OPERATOR_BINDINGS',readOnly:true}));process.exitCode=1;return;
  }
  let runtimeMode, directMode;
  try {
    runtimeMode=inspectRuntimeBinding(process.env.DATABASE_URL);directMode=inspectRuntimeBinding(process.env.DIRECT_URL);
    if(directMode==='transaction-pooler')throw new Error();
  } catch {
    console.log(JSON.stringify({status:'BLOCKED',reason:'TARGET_SCHEMA_CONNECTION_MODE_OR_EXPLICIT_STRICT_TLS_NOT_VERIFIED',readOnly:true}));process.exitCode=1;return;
  }
  const require = createRequire(path.join(process.cwd(),'package.json'));
  if(require('@prisma/client/package.json').version !== '5.22.0') throw new Error();
  const {PrismaClient}=require('@prisma/client');
  const results=[];
  for(const [name,url,mode] of [['runtime',process.env.DATABASE_URL,runtimeMode],['direct',process.env.DIRECT_URL,directMode]]) {
    let db;
    let phase='PRISMA_INIT';
    try {
      db=new PrismaClient({datasources:{db:{url}},log:[]});
      phase='CONNECT';
      await db.$connect();
      phase='START_TRANSACTION';
      const result=await db.$transaction(async tx=>{
        phase='SET_READ_ONLY';
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        phase='SET_TIMEOUT';
        await tx.$executeRaw`SET LOCAL statement_timeout='5s'`;
        phase='IDENTITY_METADATA';
        const identity=await tx.$queryRaw`SELECT current_database() AS database, current_schema() AS schema, current_user AS role, current_setting('transaction_read_only') AS read_only, has_schema_privilege('public','USAGE') AS schema_usage, (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS backend_tls`;
        phase='TABLE_GRANTS_METADATA';
        const tables=await tx.$queryRaw`SELECT n.name, c.oid IS NOT NULL AS present, c.relrowsecurity AS rls_enabled, CASE WHEN c.oid IS NULL THEN NULL ELSE pg_catalog.row_security_active(c.oid) END AS rls_active, CASE WHEN c.oid IS NULL THEN false ELSE (has_table_privilege(c.oid,'SELECT') AND has_table_privilege(c.oid,'INSERT') AND has_table_privilege(c.oid,'UPDATE') AND has_table_privilege(c.oid,'DELETE')) END AS crud FROM (VALUES ('Product'),('ProductImage'),('ProductVariant'),('ProductOptionGroup'),('ProductOptionValue'),('ProductVariantOptionValue'),('Inventory'),('SessionRevocation'),('AuthRateLimit'),('PendingRegistration'),('StagedProductMedia'),('ProductEditorSave')) AS n(name) LEFT JOIN pg_class c ON c.oid=to_regclass(format('public.%I',n.name)) ORDER BY n.name`;
        phase='CONNECTION_CHECK';
        await tx.$queryRaw`SELECT 1 AS prisma_connection_check`;
        return {identity:identity[0],tables};
      },{timeout:10000});
      const identityReady=result.identity.database==='postgres' && result.identity.schema==='public' && result.identity.read_only==='on' && result.identity.schema_usage===true;
      const runtimeContract=result.tables.every(t=>t.present && t.crud && t.rls_enabled && t.rls_active===false);
      results.push({connection:name,mode,strictTlsRequested:true,identityReady,runtimeContract,...result});
    } catch (error) {
      console.log(JSON.stringify(safeProbeFailure(error,phase,name)));
      process.exitCode=1;
      return;
    } finally {
      if(db) {
        try { await db.$disconnect(); }
        catch(error) {
          console.log(JSON.stringify(safeProbeFailure(error,'DISCONNECT',name)));
          process.exitCode=1;
        }
      }
    }
    if(process.exitCode) return;
  }
  const pass=results.every(r=>r.identityReady&&r.runtimeContract);
  console.log(JSON.stringify({status:pass?'PASS':'BLOCKED',readOnly:true,results,limitations:['Backend TLS reports PostgreSQL hop; pooler client TLS is separately enforced by strict DSN settings and successful Prisma connection.','Does not compare migration ledger, prove deployment snapshot binding or Preview isolation. Run repository release:preflight separately.','Effective role metadata is operator-local; redact if required before sharing. No customer rows read.']},null,2));
  if(!pass)process.exitCode=1;
}
const canonical = value => {
  const resolved = realpathSync(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};
if(process.argv[1] && canonical(process.argv[1])===canonical(fileURLToPath(import.meta.url))) main().catch(()=>{console.error('Runtime role probe BLOCKED: protected configuration, connection or metadata privilege unavailable; raw error suppressed.');process.exitCode=1;});
