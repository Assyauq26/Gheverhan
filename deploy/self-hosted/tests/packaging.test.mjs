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
    assert.equal(first.JNT_CONFIG_SCOPE,'local_store');
    assert.equal(second.JNT_CONFIG_SCOPE,'local_store');
    assert.match(first.JNT_INTEGRATION_ENCRYPTION_KEY,/^[A-Za-z0-9+/]{43}=$/);
    assert.equal(Buffer.from(first.JNT_INTEGRATION_ENCRYPTION_KEY,'base64').length,32);
    assert.notEqual(first.JNT_INTEGRATION_ENCRYPTION_KEY,second.JNT_INTEGRATION_ENCRYPTION_KEY);
    assert.equal(loadPrivateConfig(path.join(a,'private/migration.json'),'migration').JNT_INTEGRATION_ENCRYPTION_KEY,undefined);
    assert.equal(loadPrivateConfig(path.join(a,'private/migration.json'),'migration').JNT_CONFIG_SCOPE,undefined);
    const publicEnv=readFileSync(path.join(a,'.env'),'utf8');
    assert.ok(!publicEnv.includes(first.JNT_INTEGRATION_ENCRYPTION_KEY));
    assert.ok(!publicEnv.includes('JNT_INTEGRATION_ENCRYPTION_KEY'));
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
    const fixture=path.join(tmp,'instance');
    prepareFixture(fixture,{domain:'store.example',appImage:digest,migrationImage:digest});
    const valid=loadPrivateConfig(path.join(fixture,'private/runtime.json'));
    // Old self-hosted stores did not have local J&T secrets. They must
    // continue to boot unchanged after upgrading the application image.
    const legacyRuntime={...valid};
    delete legacyRuntime.JNT_CONFIG_SCOPE;
    delete legacyRuntime.JNT_INTEGRATION_ENCRYPTION_KEY;
    writeFileSync(file,JSON.stringify(legacyRuntime),{mode:0o600});
    assert.equal(loadPrivateConfig(file).JNT_CONFIG_SCOPE,undefined);
    for(const patch of [
      {JNT_CONFIG_SCOPE:'legacy_platform'},
      {JNT_INTEGRATION_ENCRYPTION_KEY:'short-key'},
      {JNT_CONFIG_SCOPE:undefined},
    ]) {
      const tampered={...valid,...patch};
      writeFileSync(file,JSON.stringify(tampered),{mode:0o600});
      assert.throws(()=>loadPrivateConfig(file),'invalid local J&T scope/key must fail closed');
    }
    writeFileSync(file,JSON.stringify({...valid,DIRECT_URL:'postgresql://secret:secret@db:5432/example'}),{mode:0o600});
    assert.throws(()=>loadPrivateConfig(file),'runtime must not receive migration URL');
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
