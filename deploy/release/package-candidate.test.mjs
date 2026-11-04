import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
test('synthetic packaging preserves constrained data, rejects overwrite and wrong receipt',{skip:process.platform==='win32'},()=>{
 const parent=mkdtempSync(join(tmpdir(),'release-package-')),root=join(parent,'data');mkdirSync(root);mkdirSync(root+'/channels/pilot',{recursive:true});mkdirSync(root+'/artifacts');
 const m={release_id:'rel-1.0.0-pilot',image_archive_target:'artifacts/app.tar.gz',image_bundle_target:'artifacts/app.bundle.json',migration_archive_target:'artifacts/migration.tar.gz',migration_bundle_target:'artifacts/migration.bundle.json'};
 writeFileSync(root+'/root.json','synthetic root DATA ONLY');writeFileSync(root+'/2.root.json','synthetic rotation DATA ONLY');for(const n of ['timestamp.json','snapshot.json','targets.json',...Object.values(m).slice(1)])writeFileSync(root+'/'+n,'synthetic DATA ONLY');writeFileSync(root+'/channels/pilot/release.json',JSON.stringify(m));
 const hash=f=>createHash('sha256').update(readFileSync(f)).digest('hex');const receipt={status:'VERIFIED',release_id:m.release_id,root_sha256:hash(root+'/root.json'),manifest_sha256:hash(root+'/channels/pilot/release.json'),expires_at:new Date(Date.now()+60000).toISOString()};const rp=parent+'/receipt.json';writeFileSync(rp,JSON.stringify(receipt));
 const tool=resolve('deploy/release/package-candidate.mjs'),zip=parent+'/candidate.zip';execFileSync(process.execPath,[tool,root,rp,zip]);const names=execFileSync('unzip',['-Z1',zip],{encoding:'utf8'}).trim().split('\n');assert.equal(names.length,10);assert.ok(names.includes('2.root.json'));assert.ok(names.includes('artifacts/app.tar.gz'));assert.throws(()=>execFileSync(process.execPath,[tool,root,rp,zip],{stdio:'pipe'}));receipt.manifest_sha256='0'.repeat(64);writeFileSync(rp,JSON.stringify(receipt));assert.throws(()=>execFileSync(process.execPath,[tool,root,rp,parent+'/bad.zip'],{stdio:'pipe'}));
});

test('keyless packaging contains signed envelope and no root metadata',{skip:process.platform==='win32'},()=>{
 const parent=mkdtempSync(join(tmpdir(),'keyless-package-')),root=join(parent,'data');mkdirSync(root+'/channels/stable',{recursive:true});mkdirSync(root+'/artifacts');
 const manifest={release_id:'rel-1.0.0-stable',image_archive_target:'artifacts/app.tar.gz',image_bundle_target:'artifacts/app.bundle.json',migration_archive_target:'artifacts/migration.tar.gz',migration_bundle_target:'artifacts/migration.bundle.json'};
 const source='a'.repeat(40),envelope={schema_version:'btos-keyless-release/v2',source_sha:source,manifest};
 writeFileSync(root+'/channels/stable/release.json',JSON.stringify(envelope));writeFileSync(root+'/channels/stable/release.sigstore.json','synthetic signature DATA ONLY');
 for(const file of Object.values(manifest).slice(1))writeFileSync(root+'/'+file,'synthetic target DATA ONLY');
 const receipt={status:'VERIFIED',trust_mode:'keyless-v2',source_sha:source,authority_sha256:'b'.repeat(64),root_sha256:'',release_id:manifest.release_id,manifest_sha256:createHash('sha256').update(readFileSync(root+'/channels/stable/release.json')).digest('hex'),expires_at:new Date(Date.now()+60000).toISOString()};
 const rp=parent+'/receipt.json';writeFileSync(rp,JSON.stringify(receipt));const zip=parent+'/release.zip';execFileSync(process.execPath,[resolve('deploy/release/package-candidate.mjs'),root,rp,zip]);
 const names=execFileSync('unzip',['-Z1',zip],{encoding:'utf8'}).trim().split('\n');assert.equal(names.length,6);assert(names.includes('channels/stable/release.sigstore.json'));assert(!names.some(n=>/root|targets|snapshot|timestamp/.test(n)));
});
