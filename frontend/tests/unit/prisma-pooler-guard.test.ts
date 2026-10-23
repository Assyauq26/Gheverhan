import {describe,it,expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import {assertPrismaPoolerCompatibility} from '../../src/lib/prisma-pooler-guard';
const base='postgresql://fixture.bztprltkevacidcpjaam:secret-sentinel@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require&sslaccept=strict';
describe('application Prisma transaction pooler compatibility',()=>{
 for(const [label,suffix] of [['missing',''],['false','&pgbouncer=false'],['wrong case','&pgbouncer=TRUE'],['nonboolean','&pgbouncer=1'],['duplicate','&pgbouncer=true&pgbouncer=false'],['duplicate true','&pgbouncer=true&pgbouncer=true']])it(`rejects ${label} flag without printing a DSN`,()=>{
  try{assertPrismaPoolerCompatibility(base+suffix);throw new Error('Expected rejection');}catch(error){expect(error).toBeInstanceOf(Error);expect((error as Error).message).toContain('belum valid');expect((error as Error).message).not.toContain('secret-sentinel');expect((error as Error).message).not.toContain('postgresql://');}
 });
 it('accepts an explicit single true flag without modifying source bindings',()=>{const raw=base+'&pgbouncer=true';expect(()=>assertPrismaPoolerCompatibility(raw)).not.toThrow();expect(raw).toBe(base+'&pgbouncer=true');});
 it('does not impose transaction mode on session, direct or disposable endpoints',()=>{
  for(const raw of [undefined,base.replace(':6543',':5432'),'postgresql://fixture@db.bztprltkevacidcpjaam.supabase.co:5432/postgres','postgresql://fixture@127.0.0.1:6543/test'])expect(()=>assertPrismaPoolerCompatibility(raw)).not.toThrow();
 });
 it('blocks the real application Prisma entrypoint before opening a database connection',()=>{
  const code=`try{await import('./src/lib/prisma.ts');console.log('UNEXPECTED_NOT_BLOCKED');}catch(error){console.log(error.message==='Konfigurasi kompatibilitas transaction pooler Prisma belum valid.'?'POOLER_COMPATIBILITY_BLOCKED':'UNEXPECTED_FAILURE');process.exitCode=1;}`;
  const child=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',code],{encoding:'utf8',timeout:5000,env:{PATH:process.env.PATH,NODE_ENV:'production',VERCEL_ENV:'production',DATABASE_URL:base,DIRECT_URL:base.replace(':6543',':5432')}});
  expect(child.status).toBe(1);expect(child.stdout.trim()).toBe('POOLER_COMPATIBILITY_BLOCKED');expect(child.stdout+child.stderr).not.toContain('secret-sentinel');expect(child.stdout+child.stderr).not.toContain('postgresql://');
 });
 it('fails malformed supplied URLs without reflecting their input',()=>{expect(()=>assertPrismaPoolerCompatibility('invalid secret-sentinel')).toThrow('Konfigurasi database tidak valid.');});
});
