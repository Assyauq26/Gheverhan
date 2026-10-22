import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { inspectRuntimeBinding } from '../../scripts/release/runtime-role-probe.mjs';
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
 it('rejects transaction-pooler DIRECT_URL before connecting or leaking a DSN',()=>{
  const pooled=`postgresql://dummy.${ref}:fixture@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require&sslaccept=strict`;
  const child=spawnSync(process.execPath,['scripts/release/runtime-role-probe.mjs'],{env:{NODE_ENV:"test",PATH:process.env.PATH,DATABASE_URL:base,DIRECT_URL:pooled},encoding:'utf8',timeout:5000});
  expect(child.status).toBe(1);expect(child.stdout).toContain('TARGET_SCHEMA_CONNECTION_MODE_OR_EXPLICIT_STRICT_TLS_NOT_VERIFIED');expect(child.stdout+child.stderr).not.toContain('fixture');expect(child.stdout+child.stderr).not.toContain('postgresql://');
 });
});
