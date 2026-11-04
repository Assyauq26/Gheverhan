import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair,exportJWK,SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { domain,installationInput,hash,origin } from '../src/common.mjs';
import { deviceKey,pairingProof,sellerAuthenticator,requireCsrf } from '../src/auth.mjs';
import { createPool } from '../src/db.mjs';
import { createHandler } from '../src/api.mjs';

test('canonical independent-store domain and strict input',()=>{
 assert.equal(domain('Toko.Example'),'toko.example');
 assert.equal(domain('bücher.example'),'xn--bcher-kva.example');
 for(const bad of ['localhost','127.0.0.1','https://store.example','a/b.example','-x.example','x.local','x.example\n'])assert.throws(()=>domain(bad));
 assert.throws(()=>installationInput({display_name:'Store',domain:'store.example',profile:'fresh_vps_ubuntu_amd64',requested_install_version:'stable',seller_id:randomUUID()}));
 assert.throws(()=>origin('http://portal.example'));
});
test('refuses storefront database identity before connection',()=>{
 for(const name of ['gheverhan','postgres','js_123'])assert.throws(()=>createPool('postgresql://fixture:fixture@127.0.0.1/'+name));
});
test('missing external identity provider and CSRF fail closed',async()=>{
 await assert.rejects(sellerAuthenticator({},null)(new Request('https://portal.example')),e=>e.code==='AUTH_UNAVAILABLE');
 assert.throws(()=>requireCsrf(new Request('https://portal.example',{headers:{origin:'https://evil.example','x-csrf-token':'x'}}),{csrf_token:'x'},'https://portal.example'));
});
test('release extension has fixed route boundary and does not bypass other authentication',async()=>{
 const calls=[],pool={query:async()=>({rows:[{count:1}]})};
 const handler=createHandler({pool,controlOrigin:'https://portal.example',signingKey:{},installRelease:async request=>{
  calls.push(new URL(request.url).pathname);return Response.json({error:{code:'RELEASE_AUTH_REQUIRED'}},{status:401});
 }});
 for(const path of ['/api/installer/v1/agent/install-authorization','/api/installer/v1/installations/550e8400-e29b-41d4-a716-446655440000/install-progress']) {
  const response=await handler(new Request('https://portal.example'+path));assert.equal(response.status,401);
 }
 assert.equal(calls.length,2);
 for(const path of ['/api/installer/v1/installations','/api/installer/v1/agent/arbitrary-shell']) {
  const response=await handler(new Request('https://portal.example'+path));assert.equal(response.status,503);
 }
 assert.equal(calls.length,2);
});
test('only public Ed25519 identity and fresh key-bound JOSE proof accepted',async()=>{
 const {privateKey,publicKey}=await generateKeyPair('EdDSA',{crv:'Ed25519',extractable:true});const jwk=await exportJWK(publicKey);
 const identity=await deviceKey(jwk);assert.equal(identity.thumbprint.length,43);
 await assert.rejects(deviceKey({...jwk,d:'secret'}));
 const pairing={public_jwk:jwk,nonce:'nonce',device_hash:hash('device')};const now=Math.floor(Date.now()/1000);
 const sign=(patch={})=>new SignJWT({nonce:'nonce',operation:'pairing-token',code_hash:hash('device'),...patch}).setProtectedHeader({alg:'EdDSA',typ:'jetseller-pairing+jwt'}).setAudience('https://portal.example').setIssuedAt(now).setExpirationTime(now+60).setJti(randomUUID()).sign(privateKey);
 assert.ok((await pairingProof(await sign(),pairing,'https://portal.example')).jti_hash);
 for(const patch of [{nonce:'wrong'},{operation:'arbitrary-shell'},{code_hash:hash('other')}])await assert.rejects(pairingProof(await sign(patch),pairing,'https://portal.example'));
 const other=await generateKeyPair('EdDSA',{crv:'Ed25519'});const forged=await new SignJWT({nonce:'nonce',operation:'pairing-token',code_hash:hash('device')}).setProtectedHeader({alg:'EdDSA',typ:'jetseller-pairing+jwt'}).setAudience('https://portal.example').setIssuedAt(now).setExpirationTime(now+60).setJti(randomUUID()).sign(other.privateKey);
 await assert.rejects(pairingProof(forged,pairing,'https://portal.example'));
});
