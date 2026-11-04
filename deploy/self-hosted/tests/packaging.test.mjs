import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,readFileSync,rmSync,writeFileSync,symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareFixture, prepareBuildContext } from '../prepare.mjs';
import { loadPrivateConfig } from '../launch.mjs';

const digest='sha256:'+'a'.repeat(64);
test('per-install private credentials are distinct and runtime cannot read migration secret',()=>{
  const tmp=mkdtempSync(path.join(os.tmpdir(),'js-packaging-'));
  try {
    const a=path.join(tmp,'one'),b=path.join(tmp,'two');
    for(const target of [a,b])prepareFixture(target,{domain:'store.example',appImage:digest,migrationImage:digest});
    const first=loadPrivateConfig(path.join(a,'private/runtime.json')),second=loadPrivateConfig(path.join(b,'private/runtime.json'));
    assert.notEqual(first.JWT_SECRET,second.JWT_SECRET);assert.notEqual(first.DATABASE_URL,second.DATABASE_URL);
    assert.equal(first.DIRECT_URL,undefined);assert.equal(first.JETSELLER_MIGRATION_IDENTITY,'js_migrate');
    assert.throws(()=>loadPrivateConfig(path.join(a,'private/migration.json')));
    assert.ok(loadPrivateConfig(path.join(a,'private/migration.json'),'migration').DIRECT_URL);
    assert.throws(()=>prepareFixture(a,{domain:'store.example',appImage:digest,migrationImage:digest}));
  } finally {rmSync(tmp,{recursive:true,force:true});}
});
test('invalid domains, mutable images and malformed runtime secrets fail closed',()=>{
  const tmp=mkdtempSync(path.join(os.tmpdir(),'js-packaging-'));
  try {
    for(const domain of ['gheverhan.store','a.gheverhan.store','x;evil','http://store.example'])assert.throws(()=>prepareFixture(path.join(tmp,'bad'),{domain,appImage:digest,migrationImage:digest}));
    assert.throws(()=>prepareFixture(path.join(tmp,'bad'),{domain:'store.example',appImage:'app:latest',migrationImage:digest}));
    const file=path.join(tmp,'secret');writeFileSync(file,JSON.stringify({NODE_OPTIONS:'--require bad'}),{mode:0o600});assert.throws(()=>loadPrivateConfig(file));
    writeFileSync(file,'{broken');assert.throws(()=>loadPrivateConfig(file));
  } finally {rmSync(tmp,{recursive:true,force:true});}
});

test('filtered build context preserves shipping coverage source route and excludes generated dependencies',()=>{
  const tmp=mkdtempSync(path.join(os.tmpdir(),'js-context-'));
  try {
    const context=path.join(tmp,'context'); prepareBuildContext(context);
    assert.ok(readFileSync(path.join(context,'src/app/admin/shipping/coverage/page.tsx')).length>0);
    assert.throws(()=>readFileSync(path.join(context,'node_modules/next/package.json')));
  } finally {rmSync(tmp,{recursive:true,force:true});}
});
