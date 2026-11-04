import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReleaseCatalog} from '../src/install-release.mjs';

function catalog(){
 const value={version:2,trust_mode:'keyless-v2',source_sha:'a'.repeat(40),authority_sha256:'b'.repeat(64),release_id:'rel-1.0.0-stable',manifest_sha256:'c'.repeat(64),policy_sha256:'d'.repeat(64),expires_at:new Date(Date.now()+60000).toISOString(),installer:{url:'https://dashboard.buattokosendiri.web.id/bootstrap/installer/jetseller-setup',sha256:'e'.repeat(64),signature_url:'https://dashboard.buattokosendiri.web.id/bootstrap/signature/signature.json'},policy_url:'https://dashboard.buattokosendiri.web.id/bootstrap/policy/policy.json',release_bundle:{delivery:'scoped',sha256:'f'.repeat(64),bytes:1024}};
 value.policy_signature_sha256='8'.repeat(64);value.policy_signature_url='https://dashboard.buattokosendiri.web.id/bootstrap/'+value.policy_signature_sha256+'/policy-signature.json';value.installer.signature_sha256='9'.repeat(64);
 value.verification_receipt={status:'VERIFIED',trust_mode:value.trust_mode,source_sha:value.source_sha,authority_sha256:value.authority_sha256,root_sha256:'',release_id:value.release_id,manifest_sha256:value.manifest_sha256,expires_at:value.expires_at,trust_state:{trust_mode:value.trust_mode,source_sha:value.source_sha,authority_sha256:value.authority_sha256,manifest_sha256:value.manifest_sha256}};
 return value;
}
test('keyless catalog requires verified source/authority receipt without a fabricated root',()=>{
 const original=catalog();assert.equal(validateReleaseCatalog(original),original);
 for(const mutate of [
  v=>v.authority_sha256='0'.repeat(64),v=>v.source_sha='0'.repeat(40),v=>v.root_sha256='0'.repeat(64),
  v=>v.verification_receipt.root_sha256='0'.repeat(64),v=>v.verification_receipt.status='UNVERIFIED',
  v=>v.verification_receipt.trust_state.authority_sha256='0'.repeat(64),v=>v.verification_receipt.trust_state.manifest_sha256='0'.repeat(64),
  v=>v.trust_mode='none',v=>v.expires_at=new Date(Date.now()-1000).toISOString(),
 ]){const value=catalog();mutate(value);assert.throws(()=>validateReleaseCatalog(value));}
});
