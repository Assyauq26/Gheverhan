import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
 assert.match(workflow,/github.ref == 'refs\/heads\/main'/);
 assert.match(workflow,/needs: protection\n    environment: production-migration/);
 assert.match(workflow,/ref: 2069bdeae3ab74fabd640b23b71d5c7f073f7f21/);
 assert.match(workflow,/persist-credentials: false/);
 const before=workflow.split('- name: Read-only runtime\/direct')[0];
 assert.ok(!before.includes('secrets.'));
 assert.match(before,/npm ci --ignore-scripts/);
 assert.ok(!/pull_request_target|id-token: write|contents: write|upload-artifact|migrate deploy|db push|vercel deploy|vercel promote/.test(workflow));
 assert.match(workflow,/npm run release:preflight/);
 assert.match(workflow,/test "\$runtime" -eq 0 && test "\$release" -eq 0/);
});
