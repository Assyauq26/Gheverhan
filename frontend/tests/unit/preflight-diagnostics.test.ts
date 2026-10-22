import {describe,it,expect} from 'vitest';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {instrumentCandidate,prepareReleaseDiagnostics} from '../../scripts/release/preflight-diagnostics.mjs';
const tail=`main().catch(() => {
  console.error(
    "Release preflight BLOCKED: database/configuration check failed; no write was attempted",
  );
  process.exitCode = 1;
});
`;
describe('exact candidate diagnostics boundary',()=>{
 it('only changes the terminal handler and adds the safe classifier import',()=>{
  const body='// synthetic SQL/gates sentinel\nasync function main() {}\n',out=instrumentCandidate(body+tail);
  expect(out).toContain(body);expect(out).toContain("safeProbeFailure(error, 'RELEASE_PREFLIGHT', 'runtime')");
  expect(out).not.toContain('console.error');expect(out).toContain('process.exitCode = 1');
 });
 it('executes a typed SQL failure with exit 1 and no raw secret output',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'preflight-failure-')),file=path.join(dir,'probe.mjs');
  try{
   copyFileSync(new URL('../../scripts/release/prisma-safe-error.mjs',import.meta.url),path.join(dir,'prisma-safe-error.mjs'));
   writeFileSync(file,instrumentCandidate("async function main(){throw {code:'P2010',meta:{code:'42883'},message:'secret-sentinel postgresql://private'};}\n"+tail));
   const child=spawnSync(process.execPath,[file],{encoding:'utf8'}),result=JSON.parse(child.stdout);
   expect(child.status).toBe(1);expect(result.sqlState).toBe('42883');expect(result.phase).toBe('RELEASE_PREFLIGHT');
   expect(child.stdout+child.stderr).not.toContain('secret-sentinel');expect(child.stdout+child.stderr).not.toContain('postgresql://');
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
 it('rejects changed, missing, repeated or already instrumented boundaries',()=>{
  for(const input of ['',tail+'extra',tail+tail,instrumentCandidate(tail)])expect(()=>instrumentCandidate(input)).toThrow();
 });
 it('rejects unreviewed checksums without modifying source',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'preflight-source-')),file=path.join(dir,'preflight.ts');
  try{writeFileSync(file,tail);expect(()=>prepareReleaseDiagnostics(file)).toThrow();expect(readFileSync(file,'utf8')).toBe(tail);}finally{rmSync(dir,{recursive:true,force:true});}
 });
});
