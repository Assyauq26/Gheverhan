/** TLS/auth fixtures only: no Production target or inherited application binding. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {bindPrismaCa,prepareProductionTransport} from '../../scripts/release/prisma-transport.mjs';
import {safeProbeFailure} from '../../scripts/release/prisma-safe-error.mjs';
import {runRuntimeProbe} from '../../scripts/release/runtime-role-probe.mjs';
const base=process.env.PRISMA_TLS_TEST_URL;
const parsed=new URL(base||'http://invalid');
if(process.env.GHEVERHAN_ISOLATED_TESTS!=='1'||!['localhost','127.0.0.1'].includes(parsed.hostname)||parsed.pathname!=='/gheverhan_tls_probe_test')throw new Error('Disposable TLS target required');
const ca=readFileSync(process.env.PRISMA_TLS_TEST_CA_FILE,'utf8');
const wrongCa=readFileSync(process.env.PRISMA_TLS_TEST_WRONG_CA_FILE,'utf8');
const ctx=rawCa=>bindPrismaCa([{name:'runtime',url:base,mode:'isolated'}],rawCa);
const connect=async(url,fn)=>{const db=new PrismaClient({datasources:{db:{url}},log:[]});try{await db.$connect();return fn?await fn(db):true;}finally{await db.$disconnect();}};
async function rejected(url,phase='CONNECT') {
 try{await connect(url);assert.fail('Connection unexpectedly accepted');}catch(error){
  const safe=safeProbeFailure(error,phase,'runtime');
  const output=JSON.stringify(safe);assert.ok(!output.includes(parsed.password));assert.ok(!output.includes('BEGIN CERTIFICATE'));assert.ok(!output.includes('postgresql://'));
  return {...safe,legacyCodeMissing:error.code===undefined};
 }
}
test('same CA verifies via OpenSSL AND real Prisma 5.22 read-only connection',async()=>{
 const c=ctx(ca);try{
  const url=c.connections[0].url, file=new URL(url).searchParams.get('sslcert');
  const openssl=spawnSync('openssl',['s_client','-starttls','postgres','-connect',`localhost:${parsed.port}`,'-verify_return_error','-verify_hostname','localhost','-CAfile',file,'-brief'],{input:'',stdio:'ignore',timeout:5000});assert.equal(openssl.status,0);
  const result=await connect(url,db=>db.$transaction(async tx=>{await tx.$executeRaw`SET TRANSACTION READ ONLY`;return tx.$queryRaw`SELECT current_setting('transaction_read_only')='on' AS read_only,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls`;}));
  assert.equal(result[0].read_only,true);assert.equal(result[0].tls,true);
 }finally{c.cleanup();}
});
test('negative control: OpenSSL CA alone does not configure Prisma trust',async()=>{const error=await rejected(base);assert.equal(error.prismaCode,'P1011');assert.equal(error.legacyCodeMissing,true);assert.match(error.category,/^TLS_/);});
test('Prisma 5.22 ignores sslrootcert: it is not equivalent to sslcert',async()=>{
 const c=ctx(ca);try{const url=new URL(c.connections[0].url);const path=url.searchParams.get('sslcert');url.searchParams.delete('sslcert');url.searchParams.set('sslrootcert',path);assert.equal((await rejected(url.toString())).prismaCode,'P1011');}finally{c.cleanup();}
});
test('wrong trusted CA fails with a classified certificate error',async()=>{const c=ctx(wrongCa);try{assert.equal((await rejected(c.connections[0].url)).category,'TLS_CERTIFICATE_UNTRUSTED');}finally{c.cleanup();}});
test('correct CA cannot bypass hostname verification',async()=>{const c=ctx(ca);try{const url=new URL(c.connections[0].url);url.hostname='127.0.0.1';const failure=await rejected(url.toString());assert.equal(failure.prismaCode,'P1011');assert.equal(failure.category,'TLS_HOSTNAME_MISMATCH');}finally{c.cleanup();}});
test('real authentication rejection is P1000 errorCode, never UNCLASSIFIED',async()=>{const c=ctx(ca);try{const url=new URL(c.connections[0].url);url.password='wrong-disposable-password';const failure=await rejected(url.toString());assert.equal(failure.prismaCode,'P1000');assert.equal(failure.category,'POSTGRES_AUTHENTICATION_REJECTED');}finally{c.cleanup();}});
test('real missing engine is classified without native path or credential output',()=>{
 const c=ctx(ca);try{
  const program=`import {PrismaClient} from '@prisma/client';import {safeProbeFailure} from './scripts/release/prisma-safe-error.mjs';const db=new PrismaClient({datasources:{db:{url:process.env.TEST_URL}},log:[]});try{await db.$connect();process.exitCode=2;}catch(e){console.log(JSON.stringify(safeProbeFailure(e,'CONNECT','runtime')));}finally{await db.$disconnect();}`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',program],{env:{PATH:process.env.PATH,TEST_URL:c.connections[0].url,PRISMA_QUERY_ENGINE_LIBRARY:'/nonexistent/disposable-native-engine.so.node'},encoding:'utf8',timeout:10000});
  assert.equal(child.status,0);assert.equal(JSON.parse(child.stdout).category,'PRISMA_ENGINE_LOAD_FAILED');assert.ok(!(child.stdout+child.stderr).includes(parsed.password));
 }finally{c.cleanup();}
});
test('stalled TLS negotiation times out rather than hanging or leaking credentials',async()=>{
 const sockets=new Set();const server=createServer(s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const c=ctx(ca);try{const url=new URL(c.connections[0].url);url.port=String(server.address().port);url.hostname='127.0.0.1';url.searchParams.set('connect_timeout','1');const failure=await rejected(url.toString());assert.equal(failure.category,'NETWORK_OR_CONNECTION_TIMEOUT');}finally{c.cleanup();for(const s of sockets)s.destroy();await new Promise(resolve=>server.close(resolve));}
});
test('metadata SQL failure differs from successful TLS/auth',async()=>{
 const c=ctx(ca);try{await connect(c.connections[0].url,async db=>{
  try{await db.$transaction(async tx=>{await tx.$executeRaw`SET TRANSACTION READ ONLY`;await tx.$queryRaw`SELECT * FROM public."Missing_TLS_Fixture_Table"`;});assert.fail('Missing table accepted');}catch(error){const safe=safeProbeFailure(error,'IDENTITY_METADATA','runtime');assert.equal(safe.prismaCode,'P2010');assert.equal(safe.sqlState,'42P01');assert.equal(safe.category,'SQL_METADATA_QUERY_FAILED');}
 });}finally{c.cleanup();}
});
test('both connections can succeed while V2/schema contract remains BLOCKED',async()=>{
 const c=ctx(ca);try{
  const logs=[];const result=await runRuntimeProbe([{...c.connections[0],name:'runtime'},{...c.connections[0],name:'direct'}],s=>logs.push(s));
  assert.equal(result.connectionsReady,true);assert.equal(result.contractReady,false);assert.equal(result.results.length,2);
  for(const r of result.results)assert.equal(r.tables.find(t=>t.name==='StagedProductMedia').present,false);
  assert.ok(!logs.join('').includes(decodeURIComponent(parsed.username)));assert.ok(!logs.join('').includes(parsed.password));
 }finally{c.cleanup();}
});
test('missing CA, unsupported TLS and direct transaction mode block before connection',()=>{
 const prod='postgresql://dummy:fixture@db.bztprltkevacidcpjaam.supabase.co:5432/postgres?sslmode=require&sslaccept=strict';
 for(const [url,rawCa,expected] of [[prod,'','CA_MISSING'],[prod.replace('sslmode=require','sslmode=verify-full'),ca,'STRICT_TLS_REQUIRED'],[prod.replace('dummy:','dummy.bztprltkevacidcpjaam:').replace('db.bztprltkevacidcpjaam.supabase.co:5432','aws-0-ap-southeast-1.pooler.supabase.com:6543'),ca,'DIRECT_URL_TRANSACTION_POOLER_NOT_ALLOWED']]){
  assert.throws(()=>prepareProductionTransport({DATABASE_URL:url,DIRECT_URL:url,SUPABASE_DB_CA_CERT:rawCa}),e=>e.reason===expected);
 }
});

test('real PostgreSQL privilege rejection stays distinct from TLS and auth',async()=>{
 const c=ctx(ca),role='tls_limited_'+randomUUID().replaceAll('-','');
 try{
  await connect(c.connections[0].url,async db=>{
   await db.$executeRawUnsafe('CREATE ROLE "'+role+'" LOGIN PASSWORD \'only-disposable-restricted-fixture\'');
   try{
    const url=new URL(c.connections[0].url);url.username=role;url.password='only-disposable-restricted-fixture';
    await connect(url.toString(),async limited=>{
     try{await limited.$transaction(async tx=>{await tx.$executeRaw`SET TRANSACTION READ ONLY`;await tx.$queryRaw`SELECT * FROM pg_catalog.pg_authid LIMIT 0`;});assert.fail('Restricted metadata query accepted');}
     catch(error){const safe=safeProbeFailure(error,'IDENTITY_METADATA','runtime');assert.equal(safe.sqlState,'42501');assert.equal(safe.category,'POSTGRES_PRIVILEGE_DENIED');}
    });
   }finally{await db.$executeRawUnsafe('DROP ROLE "'+role+'"');}
  });
 }finally{c.cleanup();}
});
