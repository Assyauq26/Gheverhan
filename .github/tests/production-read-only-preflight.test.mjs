import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const workflow = readFileSync(new URL('../workflows/production-read-only-preflight.yml', import.meta.url), 'utf8');
const script = workflow.match(/node --input-type=module <<'NODE'\n([\s\S]*?)\n          NODE/)[1];
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const validEnvironment = {can_admins_bypass:false,protection_rules:[{type:'required_reviewers',prevent_self_review:true,reviewers:[{type:'User'}]}],deployment_branch_policy:{custom_branch_policies:true,protected_branches:false}};
const validPolicies = {branch_policies:[{name:'main',type:'branch'}]};
async function execute(environment, policies, fail=false) {
 const process = {env:{GH_TOKEN:'fixture-token-never-log'},exitCode:0}; const logs=[];
 await new AsyncFunction('fetch','process','console',script)(async url=>({ok:!fail,json:async()=>url.endsWith('/deployment-branch-policies')?policies:environment}),process,{log:v=>logs.push(v),error:v=>logs.push(v)});
 assert.ok(!logs.join('').includes('fixture-token'));
 return process.exitCode;
}
test('accepts only protected main with independent reviewer and no admin bypass',async()=>assert.equal(await execute(validEnvironment,validPolicies),0));
for(const [name,change] of [
 ['admin bypass',e=>e.can_admins_bypass=true],
 ['missing bypass proof',e=>delete e.can_admins_bypass],
 ['self-review',e=>e.protection_rules[0].prevent_self_review=false],
 ['no reviewers',e=>e.protection_rules[0].reviewers=[]],
 ['no branch restriction',e=>e.deployment_branch_policy=null],
]) test(`blocks ${name}`,async()=>{const e=structuredClone(validEnvironment);change(e);assert.equal(await execute(e,validPolicies),1);});
test('blocks wildcard, tag, extra branch and missing branch policy',async()=>{
 for(const policies of [{branch_policies:[{name:'*',type:'branch'}]},{branch_policies:[{name:'main',type:'tag'}]},{branch_policies:[...validPolicies.branch_policies,{name:'feature/*',type:'branch'}]},{}])assert.equal(await execute(validEnvironment,policies),1);
});
test('API denial is BLOCKED and cannot fall through to secret job',async()=>assert.equal(await execute(validEnvironment,validPolicies,true),1));
test('workflow source, credentials and side effects remain bounded',()=>{
 assert.match(workflow,/process.env.GITHUB_REF !== 'refs\/heads\/main'/);
 assert.match(workflow,/needs: protection\n    environment: production-migration/);
 assert.match(workflow,/ref: 5132575e17eabd9b82dc5d6cce88fabc497b9985/);
 assert.match(workflow,/persist-credentials: false/);
 const before=workflow.split('- name: Read-only runtime\/direct')[0];
 assert.ok(!before.includes('secrets.'));
 assert.match(before,/npm ci --ignore-scripts/);
 assert.ok(before.includes("node-version: '22.23.4'"));
 assert.ok(before.includes('vitest run tests/unit/runtime-role-probe.test.ts'));
 assert.ok(!/pull_request_target|id-token: write|contents: write|upload-artifact|migrate deploy|db push|vercel deploy|vercel promote/.test(workflow));
 assert.match(workflow,/npm run release:preflight/);
 assert.ok(workflow.includes('SUPABASE_DB_CA_CERT: ${{ secrets.SUPABASE_DB_CA_CERT }}'));
 assert.ok(workflow.includes('ref: f5e0dde57f258d94c0b226e0c9e7a15fff62a881'));
 assert.ok(workflow.includes('git -C ../reviewed-ops rev-parse HEAD'));
 assert.ok(workflow.includes('git diff --exit-code -- prisma src package.json package-lock.json scripts/release/preflight.ts scripts/release/storage-preflight.ts'));
 assert.ok(workflow.includes('node scripts/release/verify-prisma-installation.mjs'));
 assert.ok(workflow.includes('node scripts/release/run-production-preflight.mjs'));
 assert.ok(before.includes('const restore=prepareReleaseDiagnostics'));
 assert.ok(before.includes('tests/unit/preflight-diagnostics.test.ts'));
 assert.ok(before.includes('preflight-diagnostics.mjs;'));
 assert.ok(before.includes('restore();'));
 assert.match(workflow,/exit "\$result"/);
 assert.ok(!workflow.includes('SAFE_TRANSPORT_DIAGNOSTIC'));
});

test('wrong dispatch branch or target fails instead of yielding a skipped green workflow',()=>{
 const command=workflow.match(/node -e "([^"\n]+)"/)[1];
 for(const [ref,target,expected] of [['refs/heads/main','bztprltkevacidcpjaam',0],['refs/heads/feature','bztprltkevacidcpjaam',1],['refs/heads/main','wrong-target',1],['refs/tags/main','bztprltkevacidcpjaam',1]]){
  const result=spawnSync(process.execPath,['-e',command],{env:{GITHUB_REF:ref,CONFIRMED_PROJECT_REF:target},encoding:'utf8'});
  assert.equal(result.status,expected);
 }
});

test('cone checkout rejects individual files and actually installs required overlay directories',()=>{
 const repo=fileURLToPath(new URL('../../',import.meta.url));
 const block=workflow.split('- name: Checkout immutable reviewed operational remediation')[1].split('- name: Setup Node 22')[0];
 const paths=block.split('sparse-checkout: |')[1].trim().split('\n').map(p=>p.trim()).filter(Boolean);
 assert.deepEqual(paths,['frontend/scripts/release','frontend/tests/unit','frontend/tests/fixtures/prisma-tls']);
 const dir=mkdtempSync(path.join(tmpdir(),'gheverhan-cone-regression-')),clone=path.join(dir,'clone'),fixture=path.join(dir,'fixture');
 const files=['frontend/scripts/release/run-production-preflight.mjs','frontend/tests/unit/prisma-transport.test.ts','frontend/tests/fixtures/prisma-tls/public-test-ca.txt'];
 const run=args=>spawnSync('git',args,{encoding:'utf8',env:{...process.env,LC_ALL:'C'}});
 try{
  // Actions may use a shallow/promisor checkout; the Git behavior fixture must not
  // clone that transport-specific object store or depend on its network/auth state.
  mkdirSync(fixture);assert.equal(run(['init',fixture]).status,0);
  for(const name of files){assert.equal(existsSync(path.join(repo,name)),true);mkdirSync(path.dirname(path.join(fixture,name)),{recursive:true});writeFileSync(path.join(fixture,name),readFileSync(path.join(repo,name)));}
  assert.equal(run(['-C',fixture,'add','.']).status,0);
  assert.equal(run(['-C',fixture,'-c','user.name=Git fixture','-c','user.email=fixture@example.invalid','commit','-m','Public cone checkout fixture']).status,0);
  assert.equal(run(['clone','--shared','--no-checkout',fixture,clone]).status,0);
  assert.equal(run(['-C',clone,'checkout','--detach','HEAD']).status,0);
  const negative=run(['-C',clone,'sparse-checkout','set','--cone','frontend/scripts/release','frontend/tests/unit/prisma-transport.test.ts']);
  assert.notEqual(negative.status,0);assert.match(negative.stderr,/not a directory/);
  assert.equal(run(['-C',clone,'sparse-checkout','set','--cone',...paths]).status,0);
  for(const name of files){assert.equal(existsSync(path.join(clone,name)),true);assert.deepEqual(readFileSync(path.join(clone,name)),readFileSync(path.join(repo,name)));}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
