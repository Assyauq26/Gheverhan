import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './lifecycle-fixture.mjs';
test('paired unverified intent cannot squat a domain; current TXT owner acquires bounded protected lease',async t=>{
 const published=new Set();const f=await fixture(t,{domainLookup:async(host,value)=>published.has(value)});const domain=f.installation.domain;
 assert.equal((await f.pool.query('SELECT reserved_domain FROM installer.installations WHERE id=$1',[f.installation.installation_id])).rows[0].reserved_domain,null);
 const other=await f.call('POST','/installations',{display_name:'Actual domain owner',domain,profile:'fresh_vps_ubuntu_amd64',requested_install_version:'stable'},f.users[1],{'idempotency-key':randomUUID()});assert.equal(other.status,201);assert.equal(other.body.installation.domain_claim.status,'UNVERIFIED');
 const id=other.body.installation.installation_id,route='/installations/'+id+'/domain-challenges';const challenge=(await f.call('POST',route,{},f.users[1],{'idempotency-key':randomUUID()})).body.challenge;
 published.add(challenge.record_value);const verified=await f.call('POST',route+'/'+challenge.challenge_id+'/verify',{},f.users[1]);assert.equal(verified.status,200);assert.equal(verified.body.challenge.domain_claim_active,true);
 const view=(await f.call('GET','/installations/'+id,undefined,f.users[1])).body.installation;assert.equal(view.domain_claim.status,'VERIFIED');
 const attackRoute='/installations/'+f.installation.installation_id+'/domain-challenges';const attack=(await f.call('POST',attackRoute,{},f.users[0],{'idempotency-key':randomUUID()})).body.challenge;published.add(attack.record_value);
 assert.equal((await f.call('POST',attackRoute+'/'+attack.challenge_id+'/verify',{},f.users[0])).body.error.code,'DOMAIN_CLAIMED');
 const lease=(await f.pool.query('SELECT domain_claim_expires_at FROM installer.installations WHERE id=$1',[id])).rows[0].domain_claim_expires_at;
 // Reusing a verified challenge never extends its lease; a fresh TXT is needed.
 await f.call('POST',route+'/'+challenge.challenge_id+'/verify',{},f.users[1]);assert.equal((await f.pool.query('SELECT domain_claim_expires_at FROM installer.installations WHERE id=$1',[id])).rows[0].domain_claim_expires_at.toISOString(),lease.toISOString());
 await f.pool.query("UPDATE installer.installations SET domain_claim_expires_at=now()-interval '1 second' WHERE id=$1",[id]);
 // A fresh TXT from the other owner may now acquire the expired lease atomically.
 const acquired=await f.call('POST',attackRoute+'/'+attack.challenge_id+'/verify',{},f.users[0]);assert.equal(acquired.status,200);assert.equal(acquired.body.challenge.domain_claim_active,true);
 assert.equal((await f.pool.query('SELECT count(*)::int n FROM installer.installations WHERE reserved_domain=$1',[domain])).rows[0].n,1);
 const before=(await f.pool.query('SELECT domain_claim_expires_at FROM installer.installations WHERE id=$1',[f.installation.installation_id])).rows[0].domain_claim_expires_at;
 await f.call('POST','/installations/'+f.installation.installation_id+'/unpair',{},f.users[0]);
 assert.equal((await f.pool.query('SELECT domain_claim_expires_at FROM installer.installations WHERE id=$1',[f.installation.installation_id])).rows[0].domain_claim_expires_at.toISOString(),before.toISOString(),'Unpair must not renew domain authority');
});
