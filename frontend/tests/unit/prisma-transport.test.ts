import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {inspectRuntimeBinding,prepareProductionTransport,bindPrismaCa,parseDatabaseCa} from '../../scripts/release/prisma-transport.mjs';
import {safeProbeFailure} from '../../scripts/release/prisma-safe-error.mjs';
import {safeReleaseReport} from '../../scripts/release/run-production-preflight.mjs';
const ca=readFileSync(new URL('../fixtures/prisma-tls/public-test-ca.txt',import.meta.url),'utf8');
const base='postgresql://fixture:secret-sentinel@db.bztprltkevacidcpjaam.supabase.co:5432/postgres?sslmode=require&sslaccept=strict';
describe('Prisma protected CA binding',()=>{
 it('fails closed for missing, invalid and non-certificate CA',()=>{for(const input of ['', 'not-a-certificate','-----BEGIN PRIVATE KEY-----\nsecret-sentinel'])expect(()=>parseDatabaseCa(input)).toThrow();});
 it('accepts PEM or base64 of a synthetic CA without logging it',()=>expect(parseDatabaseCa(Buffer.from(ca).toString('base64'))).toBe(parseDatabaseCa(ca)));
 it('preserves credentials/mode and binds exactly one Prisma sslcert to the SAME live protected file',()=>{
  const env={DATABASE_URL:base,DIRECT_URL:base,SUPABASE_DB_CA_CERT:ca};
  const before=JSON.stringify(env),prepared=prepareProductionTransport(env);
  const files=prepared.connections.map((c:{url:string})=>new URL(c.url).searchParams.get('sslcert')!);
  expect(files[0]).toBe(files[1]);expect(readFileSync(files[0],'utf8')).toBe(parseDatabaseCa(ca));
  if(process.platform!=='win32')expect(statSync(files[0]).mode&0o777).toBe(0o600);
  expect(new URL(prepared.connections[0].url).password).toBe(new URL(base).password);
  expect(new URL(prepared.connections[0].url).searchParams.getAll('sslcert')).toHaveLength(1);
  expect(JSON.stringify(env)).toBe(before);prepared.cleanup();expect(existsSync(files[0])).toBe(false);
 });
 it('rejects ignored libpq CA options, weak TLS, duplicate parameters, unknown targets and unmanaged CA files',()=>{
  for(const raw of [base+'&sslrootcert=/fixture.pem',base.replace('sslmode=require','sslmode=verify-full'),base.replace('sslaccept=strict','sslaccept=accept_invalid_certs'),base+'&sslmode=require',base.replace('bztprltkevacidcpjaam','abcdefghijklmnopqrst')])expect(()=>inspectRuntimeBinding(raw)).toThrow();
  expect(()=>bindPrismaCa([{name:'runtime',url:base+'&sslcert=unknown.pem',mode:'direct'}],ca)).toThrow();
 });
 it('preserves pooler semantics and disallows transaction-pooler DIRECT_URL',()=>{
  const pooled=base.replace('fixture:','fixture.bztprltkevacidcpjaam:').replace('db.bztprltkevacidcpjaam.supabase.co:5432','aws-0-ap-southeast-1.pooler.supabase.com:6543')+'&pgbouncer=true';
  expect(inspectRuntimeBinding(pooled)).toBe('transaction-pooler');
  expect(()=>prepareProductionTransport({DATABASE_URL:pooled,DIRECT_URL:pooled,SUPABASE_DB_CA_CERT:ca})).toThrow();
  const ctx=prepareProductionTransport({DATABASE_URL:pooled,DIRECT_URL:base,SUPABASE_DB_CA_CERT:ca});try{expect(new URL(ctx.connections[0].url).searchParams.get('pgbouncer')).toBe('true');}finally{ctx.cleanup();}
 });
});
describe('safe Prisma classification',()=>{
 for(const [code,category] of [['P1011','TLS_HANDSHAKE_FAILED'],['P1000','POSTGRES_AUTHENTICATION_REJECTED'],['P1001','NETWORK_OR_CONNECTION_TIMEOUT'],['P1013','PRISMA_CONFIGURATION_INVALID'],['P1010','POSTGRES_PRIVILEGE_DENIED']])it(`reads Prisma initialization errorCode ${code}, not only code`,()=>expect(safeProbeFailure({errorCode:code,message:'secret-sentinel'},'CONNECT','runtime').category).toBe(category));
 it('classifies query SQLSTATE and engine load separately',()=>{
  expect(safeProbeFailure({code:'P2010',meta:{code:'42P01'}},'IDENTITY_METADATA','direct').category).toBe('SQL_METADATA_QUERY_FAILED');
  expect(safeProbeFailure({message:'Could not load libquery_engine /secret-sentinel'},'PRISMA_INIT','runtime').category).toBe('PRISMA_ENGINE_LOAD_FAILED');
  expect(safeProbeFailure({name:'PrismaClientRustPanicError'},'CONNECT','runtime').category).toBe('PRISMA_ENGINE_STARTUP_FAILED');
 });
 it('prioritizes a typed engine panic over generic engine words in its private message',()=>{
  const result=safeProbeFailure({name:'PrismaClientRustPanicError',message:'Query Engine panic synthetic-secret'},'CONNECT','runtime');
  expect(result.category).toBe('PRISMA_ENGINE_STARTUP_FAILED');expect(JSON.stringify(result)).not.toContain('synthetic-secret');
 });
 it('classifies typed DNS and network causes without inferring them from arbitrary text',()=>{
  for(const [code,category] of [['ENOTFOUND','DNS_LOOKUP_FAILED'],['EAI_AGAIN','DNS_LOOKUP_FAILED'],['ETIMEDOUT','CONNECTION_TIMEOUT'],['ECONNREFUSED','NETWORK_UNREACHABLE']])expect(safeProbeFailure({cause:{code}},'CONNECT','runtime').category).toBe(category);
 });
 it('never emits error messages, stacks, credentials, certs, unknown codes, phases or connection labels',()=>{
  const error={errorCode:'secret-sentinel',code:base,meta:{code:ca},message:base+ca,stack:base,name:base,reason:base};
  const result=JSON.stringify(safeProbeFailure(error,base,ca));
  for(const secret of ['secret-sentinel','postgresql://','BEGIN CERTIFICATE','fixture:'])expect(result).not.toContain(secret);
  expect(JSON.parse(result).prismaCode).toBe('UNCLASSIFIED');
 });
});
describe('full release report redaction and fail-closed gate',()=>{
 it('preserves schema/Storage blockers without printing a database username or unknown metadata',()=>{
  const out=safeReleaseReport(JSON.stringify({status:'BLOCKED',schema:{productEditorV2:false,catalogPrivileges:true},databaseSettings:{role:'secret-sentinel'},productStorage:{status:'BLOCKED',reason:'PRIVATE_BUCKET_NOT_VERIFIED'},unknown:base}));
  expect(out.status).toBe('BLOCKED');if(!('schema' in out))throw new Error('Expected structured gate report');expect(out.schema.productEditorV2).toBe(false);expect(out.productStorage.reason).toBe('PRIVATE_BUCKET_NOT_VERIFIED');expect(JSON.stringify(out)).not.toContain('secret-sentinel');expect(JSON.stringify(out)).not.toContain(base);
 });
 it('only accepts a complete production PASS and still redacts role metadata',()=>{
  const schema=Object.fromEntries(['productEditorV2','schemaUsage','catalogPrivileges','customOptions','directCheckout','revocation','limiter','version','indexes','normalizedIdentityIndexes','foreignKey','trusted','pending','verifiedAt','pendingIndexes','pendingColumns'].map(k=>[k,true]));
  const presence=Object.fromEntries(['DATABASE_URL','DIRECT_URL','JWT_SECRET','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','CRON_SECRET','RESEND_API_KEY','PASSWORD_RESET_FROM','PASSWORD_RESET_BASE_URL'].map(k=>[k,true]));
  const raw={status:'PASS',readOnly:true,local:false,databaseIdentity:true,ledgerMatches:true,configPresenceReady:true,schema,presence,productStorage:{status:'PASS',reason:'PRIVATE_BUCKET_VERIFIED'},databaseSettings:{role:'secret-sentinel'}};
  expect(safeReleaseReport(JSON.stringify(raw)).status).toBe('PASS');expect(JSON.stringify(safeReleaseReport(JSON.stringify(raw)))).not.toContain('secret-sentinel');
  raw.schema.productEditorV2=false;expect(safeReleaseReport(JSON.stringify(raw)).status).toBe('BLOCKED');
 });
 it('rejects malformed/incomplete PASS and raw subprocess errors',()=>{for(const out of ['secret-sentinel',JSON.stringify({status:'PASS'}),''])expect(safeReleaseReport(out).status).toBe('BLOCKED');});
});
