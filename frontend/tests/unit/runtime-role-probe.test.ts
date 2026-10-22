import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { inspectRuntimeBinding, safeProbeFailure } from '../../scripts/release/runtime-role-probe.mjs';
const ref='bztprltkevacidcpjaam';
const base=`postgresql://dummy:fixture@db.${ref}.supabase.co:5432/postgres?sslmode=require&sslaccept=strict`;
describe('operator runtime binding probe before any connection',()=>{
 it('accepts only explicit strict-TLS direct/session/transaction profiles',()=>{
  expect(inspectRuntimeBinding(base)).toBe('direct');
  for(const [port,mode] of [['5432','session-pooler'],['6543','transaction-pooler']])expect(inspectRuntimeBinding(`postgresql://dummy.${ref}:fixture@aws-0-ap-southeast-1.pooler.supabase.com:${port}/postgres?sslmode=require&sslaccept=strict`)).toBe(mode);
 });
 it('rejects wrong project/database/schema/host and missing TLS proof',()=>{
  for(const raw of [base.replace(ref,'abcdefghijklmnopqrst'),base.replace('/postgres?','/wrong?'),base+'&schema=private',base.replace('.supabase.co','.example.test'),base.replace('sslmode=require','sslmode=disable'),base.replace('sslaccept=strict','sslaccept=accept_invalid_certs'),base.replace('&sslaccept=strict',''),base+'&sslmode=disable',base+'#ignored', 'not-a-url'])expect(()=>inspectRuntimeBinding(raw)).toThrow();
 });
 it('fails closed without environment bindings and never emits inherited secrets',()=>{
  const child=spawnSync(process.execPath,['scripts/release/runtime-role-probe.mjs'],{env:{NODE_ENV:"test",PATH:process.env.PATH,JWT_SECRET:'secret-sentinel-never-log'},encoding:'utf8',timeout:5000});
  expect(child.status).toBe(1);expect(child.stdout).toContain('MISSING_PROTECTED_OPERATOR_BINDINGS');expect(child.stdout+child.stderr).not.toContain('secret-sentinel');
 });
 it('executes fail-closed through a symlink or Windows directory-case alias',()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'runtime-probe-entry-'));
  const source=path.resolve('scripts/release/runtime-role-probe.mjs');
  let entry=path.join(directory,'probe.mjs');
  try {
   if(process.platform==='win32') entry=path.join(path.dirname(source).toUpperCase(),path.basename(source));
   else symlinkSync(source,entry);
   const child=spawnSync(process.execPath,[entry],{env:{NODE_ENV:'test',PATH:process.env.PATH},encoding:'utf8',timeout:5000});
   expect(child.status).toBe(1);expect(child.stdout).toContain('MISSING_PROTECTED_OPERATOR_BINDINGS');
  }finally{rmSync(directory,{recursive:true,force:true});}
 });
 it('rejects transaction-pooler DIRECT_URL before connecting or leaking a DSN',()=>{
  const pooled=`postgresql://dummy.${ref}:fixture@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require&sslaccept=strict`;
  const child=spawnSync(process.execPath,['scripts/release/runtime-role-probe.mjs'],{env:{NODE_ENV:"test",PATH:process.env.PATH,DATABASE_URL:base,DIRECT_URL:pooled},encoding:'utf8',timeout:5000});
  expect(child.status).toBe(1);expect(child.stdout).toContain('DIRECT_URL_TRANSACTION_POOLER_NOT_ALLOWED');expect(child.stdout+child.stderr).not.toContain('fixture');expect(child.stdout+child.stderr).not.toContain('postgresql://');
 });
});

describe('protected runtime probe safe error classification',()=>{
 it('classifies known Prisma TLS/auth/query errors without serializing credentials or raw errors',()=>{
  const leak='postgresql://very-secret:password@example.invalid/postgres?session=secret';
  for (const [code,phase] of [['P1011','CONNECT'],['P1000','CONNECT'],['P2010','IDENTITY_METADATA']]) {
    const data=safeProbeFailure({code,message:leak,stack:leak,meta:{code:'42501',details:leak}},phase,'direct');
    expect(data).toEqual({status:'BLOCKED',reason:'RUNTIME_PROBE_FAILED',connection:'direct',phase,prismaCode:code,sqlState:'42501',category:code==='P1011'?'TLS_HANDSHAKE_FAILED':code==='P1000'?'POSTGRES_AUTHENTICATION_REJECTED':'POSTGRES_PRIVILEGE_DENIED',readOnly:true});
    expect(JSON.stringify(data)).not.toContain(leak);
  }
 });
 it('blocks arbitrary error fields, invalid phases and malicious metadata without printing them',()=>{
  const leak='DO_NOT_LOG_POSTGRES_URL_OR_PASSWORD';
  const data=safeProbeFailure({code:leak,meta:{code:leak},message:leak,stack:leak},leak,leak);
  expect(data).toEqual({status:'BLOCKED',reason:'RUNTIME_PROBE_FAILED',connection:'runtime',phase:'UNEXPECTED',prismaCode:'UNCLASSIFIED',sqlState:'UNCLASSIFIED',category:'UNKNOWN_RUNTIME_EXCEPTION',readOnly:true});
  expect(JSON.stringify(data)).not.toContain(leak);
  expect(safeProbeFailure(null,'CONNECT','runtime').prismaCode).toBe('UNCLASSIFIED');
 });
});
