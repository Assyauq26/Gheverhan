const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {prepare}=require('../deploy/prepare-release.cjs');
test('limited preview is immutable, explicit and cannot enable public onboarding',()=>{
 const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),root=fs.mkdtempSync(path.join(os.tmpdir(),'btos-preview-'));
 const manifest=prepare(sha,root,'limited-preview'),directory=path.join(root,sha);
 assert.equal(manifest.deployment,'NOT_DEPLOYED');assert.equal(manifest.public_onboarding,false);assert.equal(manifest.public_installer,false);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory,'portal-config.json'))),{enabled:false,portal_origin:'https://dashboard.buattokosendiri.web.id',auto_redirect:false});
 for(const file of manifest.files){
  const bytes=fs.readFileSync(path.join(directory,file.file));assert.equal(bytes.length,file.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
  if(file.file.endsWith('.html'))assert.match(bytes.toString(),/Pratinjau terbatas — pendaftaran dan instalasi toko otomatis belum dibuka untuk publik/);
 }
 assert.throws(()=>prepare(sha,root,'limited-preview'));
 assert.throws(()=>prepare(sha,root,'public-without-approval'));
});
