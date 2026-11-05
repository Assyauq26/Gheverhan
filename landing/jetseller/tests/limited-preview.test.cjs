const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {prepare}=require('../deploy/prepare-release.cjs');
test('registration release is immutable and excludes the retired preview and account flow',()=>{
 const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),root=fs.mkdtempSync(path.join(os.tmpdir(),'btos-registration-'));
 assert.throws(()=>prepare(sha,root,'limited-preview'),/retired/);
 const manifest=prepare(sha,root,'registration'),directory=path.join(root,sha);
 assert.equal(manifest.deployment,'NOT_DEPLOYED');assert.equal(manifest.public_registration,true);assert.equal(manifest.central_accounts,false);assert.equal(manifest.public_installer,false);
 for(const file of manifest.files){const bytes=fs.readFileSync(path.join(directory,file.file));assert.equal(bytes.length,file.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);if(file.file.endsWith('.html'))assert.doesNotMatch(bytes.toString(),/Pratinjau terbatas|release-preview-notice|dashboard\.buattokosendiri\.web\.id/);}
 for(const name of ['pendaftaran/index.html','kebijakan-privasi/index.html','assets/js/registration.js','assets/fonts/plus-jakarta-sans-latin.woff2'])assert(manifest.files.some(f=>f.file===name));
 assert.throws(()=>prepare(sha,root,'registration'),/never overwrite/);
});
