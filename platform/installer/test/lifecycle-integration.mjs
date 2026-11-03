import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {generateKeyPair,jwtVerify,SignJWT} from 'jose';
import {fixture} from './lifecycle-fixture.mjs';

test('real PostgreSQL refresh is durable, replay-safe, key-bound and revocable after access expiry',async t=>{
 const f=await fixture(t),wrong=await generateKeyPair('EdDSA',{crv:'Ed25519'});
 const request=await f.management('refresh'),first=await f.call('POST','/agent/credentials/refresh',request);assert.equal(first.status,200);
 assert.equal((await f.call('POST','/agent/credentials/refresh',request)).status,409);
 const retry=await f.call('POST','/agent/credentials/refresh',await f.management('refresh',{requestId:request.request_id}));assert.equal(retry.status,200);assert.equal(retry.body.credential,first.body.credential);
 const concurrent=await Promise.all([f.call('POST','/agent/credentials/refresh',await f.management('refresh',{requestId:request.request_id})),f.call('POST','/agent/credentials/refresh',await f.management('refresh',{requestId:request.request_id}))]);assert.ok(concurrent.every(x=>x.status===200&&x.body.credential===first.body.credential));
 assert.equal((await f.call('POST','/agent/credentials/refresh',await f.management('refresh',{key:wrong.privateKey}))).status,401);
 assert.equal((await f.call('POST','/agent/credentials/refresh',await f.management('refresh',{patch:{nonce:'wrong'}}))).status,401);
 const tampered=await f.management('refresh');tampered.request_id=randomUUID();assert.equal((await f.call('POST','/agent/credentials/refresh',tampered)).status,401);
 const expiredToken=await new SignJWT({installation_id:f.installation.installation_id,scopes:['report:heartbeat'],cnf:{jkt:f.credential.public_key_thumbprint}}).setProtectedHeader({alg:'EdDSA',typ:'jetseller-agent+jwt'}).setSubject(f.credential.device_id).setIssuer(f.origin).setAudience('jetseller-agent-management').setJti(randomUUID()).setIssuedAt(Math.floor(Date.now()/1000)-1200).setExpirationTime(Math.floor(Date.now()/1000)-600).sign(f.signer.privateKey);
 assert.equal((await f.call('GET','/agent/identity',undefined,null,await f.access('/agent/identity',{...f.credential,credential:expiredToken}))).status,401);
 assert.equal((await f.call('POST','/agent/credentials/refresh',await f.management('refresh'))).status,200,'Long-lived identity can renew without an unexpired bearer');
 await f.pool.query("UPDATE installer.credential_receipts SET issued_at=now()-interval '3 minutes' WHERE device_id=$1 AND request_id=$2",[f.credential.device_id,request.request_id]);assert.equal((await f.call('POST','/agent/credentials/refresh',await f.management('refresh',{requestId:request.request_id}))).body.error.code,'OPERATION_EXPIRED');
 const route='/installations/'+f.installation.installation_id+'/unpair';assert.equal((await f.call('POST',route,{},f.users[1])).status,404);assert.equal((await f.call('POST',route,{},f.users[0])).status,200);
 assert.equal((await f.call('POST','/agent/credentials/refresh',await f.management('refresh'))).status,401);
 assert.equal((await f.call('GET','/agent/identity',undefined,null,await f.access('/agent/identity',first.body))).status,401);
 const events=await f.call('GET','/installations/'+f.installation.installation_id+'/events',undefined,f.users[0]);assert.equal(events.status,200);assert.ok(events.body.events.some(e=>e.operation==='DEVICE_REVOKED'));assert.equal(JSON.stringify(events).includes(first.body.credential),false);
});
test('dual-key rotation atomically revokes old access/key and supports lost-response retry',async t=>{
 const f=await fixture(t),next=await generateKeyPair('EdDSA',{crv:'Ed25519',extractable:true});
 const input=await f.management('rotate',{newKey:next});const noNew={...input,new_key_proof:input.proof};assert.equal((await f.call('POST','/agent/credentials/rotate',noNew)).status,401);
 const first=await f.call('POST','/agent/credentials/rotate',await f.management('rotate',{newKey:next,requestId:input.request_id}));assert.equal(first.status,200);assert.notEqual(first.body.public_key_thumbprint,f.credential.public_key_thumbprint);
 const retry=await f.call('POST','/agent/credentials/rotate',await f.management('rotate',{newKey:next,requestId:input.request_id}));assert.equal(retry.status,200);assert.equal(retry.body.credential,first.body.credential);
 assert.equal((await f.call('GET','/agent/identity',undefined,null,await f.access('/agent/identity'))).status,401);
 assert.equal((await f.call('POST','/agent/credentials/refresh',await f.management('refresh'))).status,401);
 assert.equal((await f.call('GET','/agent/identity',undefined,null,await f.access('/agent/identity',first.body,next.privateKey))).status,200);
 const renewed=await f.call('POST','/agent/credentials/refresh',await f.management('refresh',{key:next.privateKey}));assert.equal(renewed.status,200);
 const p=await jwtVerify(renewed.body.credential,f.signer.publicKey);assert.equal(p.payload.key_epoch,2);
});
test('body-bound allowlisted heartbeat stores observations without installation-ready promotion',async t=>{
 const f=await fixture(t),payload={agent_version:'0.1.0',app_version:'1.2.3',app_image_digest:'sha256:'+'a'.repeat(64),readiness:'ready',update_state:'IDLE'};
 const headers=await f.access('/agent/heartbeat',f.credential,f.keys.privateKey,payload);
 assert.equal((await f.call('POST','/agent/heartbeat',{...payload,app_version:'9.9.9'},null,headers)).status,401);
 assert.equal((await f.call('POST','/agent/heartbeat',{...payload,customer_email:'forbidden@example.test'},null,headers)).status,400);
 assert.equal((await f.call('POST','/agent/heartbeat',payload,null,headers)).status,200);
 assert.equal((await f.call('POST','/agent/heartbeat',payload,null,headers)).status,409);
 const view=(await f.call('GET','/installations/'+f.installation.installation_id,undefined,f.users[0])).body.installation;assert.equal(view.app_version,'1.2.3');assert.equal(view.status,'PAIRED');assert.ok(view.last_heartbeat_at);
});
