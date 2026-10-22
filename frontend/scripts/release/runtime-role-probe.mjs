/** Official Prisma metadata probe; CA lifetime is owned by the caller. */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { prepareProductionTransport } from './prisma-transport.mjs';
import { safeProbeFailure } from './prisma-safe-error.mjs';
export { inspectRuntimeBinding } from './prisma-transport.mjs';
export { safeProbeFailure } from './prisma-safe-error.mjs';
export async function runRuntimeProbe(connections, emit=console.log) {
  const require = createRequire(path.join(process.cwd(),'package.json'));
  if(require('@prisma/client/package.json').version !== '5.22.0' || require('prisma/package.json').version !== '5.22.0') throw new Error('Prisma engine version mismatch');
  const {PrismaClient}=require('@prisma/client');
  const results=[];
  let connectionsReady=true;
  let metadataReady=true;
  for(const [name,url,mode] of connections.map(c=>[c.name,c.url,c.mode])) {
    let db;
    let connected=false;
    let phase='PRISMA_INIT';
    try {
      db=new PrismaClient({datasources:{db:{url}},log:[]});
      phase='CONNECT';
      await db.$connect();
      connected=true;
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
      const {role,...safeIdentity}=result.identity;
      results.push({connection:name,mode,strictTlsRequested:true,connectionReady:true,metadataReady:true,identityReady,runtimeContract,identity:{...safeIdentity,roleObserved:typeof role==='string'},tables:result.tables});
    } catch (error) {
      emit(JSON.stringify(safeProbeFailure(error,phase,name)));
      if(!connected)connectionsReady=false;
      metadataReady=false;
      results.push({connection:name,connectionReady:connected,metadataReady:false});
    } finally {
      if(db) {
        try { await db.$disconnect(); }
        catch(error) {
          emit(JSON.stringify(safeProbeFailure(error,'DISCONNECT',name)));
          connectionsReady=false;
        }
      }
    }

  }
  const contractReady=connectionsReady && metadataReady && results.every(r=>r.identityReady&&r.runtimeContract);
  emit(JSON.stringify({status:contractReady?'PASS':'BLOCKED',connectionStatus:connectionsReady?'PASS':'BLOCKED',metadataStatus:metadataReady?'PASS':'BLOCKED',contractStatus:contractReady?'PASS':'BLOCKED',readOnly:true,results}));
  return {connectionsReady,metadataReady,contractReady,results};
}

async function main() {
  let transport;
  try {
    if(Number(process.versions.node.split('.')[0])!==22) throw new Error('Prisma engine runtime mismatch');
    transport=prepareProductionTransport(process.env);
    const result=await runRuntimeProbe(transport.connections);
    if(!result.contractReady)process.exitCode=1;
  } catch(error) { console.log(JSON.stringify(safeProbeFailure(error,'PRISMA_INIT','runtime')));process.exitCode=1; }
  finally {transport?.cleanup();}
}
const canonical = value => {const resolved=realpathSync(value);return process.platform==='win32'?resolved.toLowerCase():resolved;};
if(process.argv[1] && canonical(process.argv[1])===canonical(fileURLToPath(import.meta.url))) main().catch(error=>{console.log(JSON.stringify(safeProbeFailure(error,'UNEXPECTED','runtime')));process.exitCode=1;});
