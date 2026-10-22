/** One CA lifetime for BOTH Prisma probe and repository release:preflight. */
import { spawnSync } from 'node:child_process';
import { realpathSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { prepareProductionTransport } from './prisma-transport.mjs';
import { safeProbeFailure } from './prisma-safe-error.mjs';
import { runRuntimeProbe } from './runtime-role-probe.mjs';
export function safeReleaseReport(stdout) {
  try {
    if(typeof stdout!=='string'||stdout.length>1000000)throw new Error();
    const trimmed=stdout.trim();
    const offset=trimmed.startsWith('{')?0:trimmed.indexOf('\n{')+1;
    if(offset===0&&!trimmed.startsWith('{'))throw new Error();
    const raw=JSON.parse(trimmed.slice(offset));
    const booleans=(object,keys)=>Object.fromEntries(keys.filter(k=>typeof object?.[k]==='boolean').map(k=>[k,object[k]]));
    const schemaKeys=['productEditorV2','schemaUsage','catalogPrivileges','customOptions','directCheckout','revocation','limiter','version','indexes','normalizedIdentityIndexes','foreignKey','trusted','pending','verifiedAt','pendingIndexes','pendingColumns'];
    const presenceKeys=['DATABASE_URL','DIRECT_URL','JWT_SECRET','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','CRON_SECRET','RESEND_API_KEY','PASSWORD_RESET_FROM','PASSWORD_RESET_BASE_URL'];
    const reasons=new Set(['STORAGE_TARGET_UNVERIFIED','BUCKET_METADATA_UNAVAILABLE','PRIVATE_BUCKET_NOT_VERIFIED','PRIVATE_BUCKET_VERIFIED']);
    const ready=raw.status==='PASS'&&raw.readOnly===true&&raw.local===false&&raw.databaseIdentity===true&&raw.ledgerMatches===true&&raw.configPresenceReady===true&&schemaKeys.every(k=>raw.schema?.[k]===true)&&presenceKeys.every(k=>raw.presence?.[k]===true)&&raw.productStorage?.status==='PASS'&&raw.productStorage?.reason==='PRIVATE_BUCKET_VERIFIED';
    return {status:ready?'PASS':'BLOCKED',readOnly:true,...booleans(raw,['databaseIdentity','ledgerMatches','configPresenceReady']),presence:booleans(raw.presence,presenceKeys),schema:booleans(raw.schema,schemaKeys),productStorage:{status:raw.productStorage?.status==='PASS'?'PASS':'BLOCKED',reason:reasons.has(raw.productStorage?.reason)?raw.productStorage.reason:'UNVERIFIED'},roleObserved:typeof raw.databaseSettings?.role==='string'};
  } catch {return {status:'BLOCKED',readOnly:true,reason:'RELEASE_METADATA_UNAVAILABLE'};}
}
async function main() {
let transport;
try {
  if(Number(process.versions.node.split('.')[0])!==22)throw new Error('Prisma engine runtime mismatch');
  transport=prepareProductionTransport(process.env);
  const probe=await runRuntimeProbe(transport.connections);
  if(!probe.connectionsReady) {
    console.log(JSON.stringify({status:'BLOCKED',reason:'RELEASE_GATE_SKIPPED_CONNECTION_FAILED',readOnly:true}));
    process.exitCode=1;
  } else {
    // Existing reviewed package script and schema/migration tree stay authoritative.
    // Capture privately: legacy script metadata includes role names, never echo it raw.
    const env={...process.env,DATABASE_URL:transport.connections[0].url,DIRECT_URL:transport.connections[1].url};
    delete env.SUPABASE_DB_CA_CERT;
    const scripts=JSON.parse(readFileSync('package.json','utf8')).scripts;
    if(scripts['release:preflight']!=='node --import tsx scripts/release/preflight.ts'||scripts['prerelease:preflight']||scripts['postrelease:preflight'])throw new Error('Unreviewed release script');
    const child=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run','release:preflight'],{env,encoding:'utf8',stdio:['ignore','pipe','pipe'],shell:process.platform==='win32',timeout:60000,maxBuffer:1000000});
    const release=safeReleaseReport(child.stdout);
    console.log(JSON.stringify({gate:'release:preflight',...release}));
    if(!probe.contractReady||child.status!==0||release.status!=='PASS')process.exitCode=1;
  }
} catch(error) {console.log(JSON.stringify(safeProbeFailure(error,'PRISMA_INIT','runtime')));process.exitCode=1;}
finally {transport?.cleanup();}

}
const canonical=value=>{const p=realpathSync(value);return process.platform==='win32'?p.toLowerCase():p;};
if(process.argv[1] && canonical(process.argv[1])===canonical(fileURLToPath(import.meta.url))) main().catch(error=>{console.log(JSON.stringify(safeProbeFailure(error,'UNEXPECTED','runtime')));process.exitCode=1;});
