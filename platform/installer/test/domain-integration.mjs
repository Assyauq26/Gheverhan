import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createPool, migrate } from '../src/db.mjs';
import { createHandler } from '../src/api.mjs';
import { hash, opaque } from '../src/common.mjs';
import { reserveDomain } from '../src/domain-reservation.mjs';
import { transaction } from '../src/db.mjs';
import { domainProofRoute } from '../src/domain-proof.mjs';

test('dedicated PostgreSQL domain consent is seller-scoped, idempotent, expiring and race-safe',async()=>{
  const connection=process.env.JETSELLER_CONTROL_TEST_DATABASE_URL;
  assert.equal(process.env.JETSELLER_CONTROL_TEST_CONFIRM,'isolated-control-fixture');
  const url=new URL(connection);assert.equal(url.pathname,'/js_control_fixture');assert.ok(['127.0.0.1','localhost'].includes(url.hostname));
  const pool=createPool(connection);
  try {
    await migrate(pool);
    const issuer='https://domain.identity.fixture.example',controlOrigin='https://domain.portal.fixture.example';
    const keys=await generateKeyPair('EdDSA',{crv:'Ed25519'}),signer=await generateKeyPair('EdDSA',{crv:'Ed25519'}),users=[];
    for(let i=0;i<2;i++) {
      const seller=randomUUID(),subject='domain-'+randomUUID(),sid=randomUUID(),csrf=opaque();
      await pool.query('INSERT INTO installer.sellers(id,external_subject,email_verified) VALUES($1,$2,true)',[seller,subject]);
      await pool.query("INSERT INTO installer.sessions(id,seller_id,csrf_hash,expires_at,authenticated_at) VALUES($1,$2,$3,now()+interval '1 hour',now())",[sid,seller,hash(csrf)]);
      const token=await new SignJWT({sid,csrf,email_verified:true}).setProtectedHeader({alg:'EdDSA'}).setSubject(subject).setIssuer(issuer).setAudience('domain-fixture').setIssuedAt().setExpirationTime('1h').sign(keys.privateKey);
      users.push({seller,csrf,token});
    }
    let observed=false,expected;
    const handler=createHandler({pool,controlOrigin,sessionIssuer:{issuer,audience:'domain-fixture',jwks:{keys:[await exportJWK(keys.publicKey)]}},signingKey:signer.privateKey,verificationKey:signer.publicKey,domainLookup:async(host,value)=>observed&&value===expected});
    const call=async(method,path,body,user=users[0],headers={})=>{
      const request=new Request(controlOrigin+'/api/installer/v1'+path,{method,headers:{'content-type':'application/json',origin:controlOrigin,cookie:'__Host-js_portal_session='+user.token,'x-csrf-token':user.csrf,...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
      const response=await handler(request,{clientAddress:'domain-'+user.seller});return {status:response.status,body:await response.json()};
    };
    const input={display_name:'Domain fixture',domain:randomUUID()+'.example',profile:'fresh_vps_ubuntu_amd64',requested_install_version:'stable'};
    const installation=(await call('POST','/installations',input,users[0],{'idempotency-key':randomUUID()})).body.installation;
    const route='/installations/'+installation.installation_id+'/domain-challenges',key=randomUUID();
    assert.equal((await call('POST',route,{},users[1],{'idempotency-key':randomUUID()})).status,404);
    assert.equal((await call('POST',route,{},users[0],{'idempotency-key':key,'x-csrf-token':'wrong'})).status,403);
    const created=await call('POST',route,{},users[0],{'idempotency-key':key});assert.equal(created.status,201);
    const challenge=created.body.challenge;expected=challenge.record_value;assert.equal(challenge.status,'DNS_PENDING');assert.equal(challenge.https_verified,false);
    assert.equal((await call('POST',route,{},users[0],{'idempotency-key':key})).body.challenge.challenge_id,challenge.challenge_id);
    const verify=route+'/'+challenge.challenge_id+'/verify';
    assert.equal((await call('POST',verify,{})).status,202);
    assert.equal((await call('POST',verify,{},users[1])).status,404);
    observed=true;
    // Deterministically hold one route after its initial installation read.
    // The real authenticated requests commit before it reads the challenge.
    const staleInstallation=(await pool.query('SELECT * FROM installer.installations WHERE id=$1',[installation.installation_id])).rows[0];
    let releaseStale,started;const held=new Promise(r=>releaseStale=r),entered=new Promise(r=>started=r);let reads=0;
    const delayed=domainProofRoute({request:new Request(controlOrigin+'/api/installer/v1'+verify,{method:'POST'}),path:'/api/installer/v1'+verify,pool,seller:{seller_id:users[0].seller},readBody:async()=>({}),lookup:async()=>true,
      own:async(client,id,seller,lock)=>{if(++reads===1){started();await held;return staleInstallation;}return (await client.query('SELECT * FROM installer.installations WHERE id=$1 AND seller_id=$2'+(lock?' FOR UPDATE':''),[id,seller])).rows[0];}});
    await entered;
    const results=await Promise.all([call('POST',verify,{}),call('POST',verify,{})]);releaseStale();
    const resumed=await delayed;assert.equal(resumed.status,200);assert.equal(resumed.body.challenge.domain_claim_active,true);
    assert.deepEqual(results.map(r=>r.status),[200,200]);
    assert.ok(results.every(r=>r.body.challenge.status==='OWNERSHIP_VERIFIED'&&r.body.challenge.https_verified===false&&r.body.challenge.installed===false));
    assert.equal(results[0].body.challenge.verified_at,results[1].body.challenge.verified_at);
    assert.equal((await call('GET',route)).body.challenge.status,'OWNERSHIP_VERIFIED');
    const newer=(await call('POST',route,{},users[0],{'idempotency-key':randomUUID()})).body.challenge;
    await pool.query("UPDATE installer.domain_challenges SET expires_at=now()-interval '1 second' WHERE id=$1",[newer.challenge_id]);
    assert.equal((await call('POST',route+'/'+newer.challenge_id+'/verify',{})).status,410);
    const changed=await call('PATCH','/installations/'+installation.installation_id,{display_name:input.display_name,domain:randomUUID()+'.example'},users[0],{'if-match':String(installation.version)});assert.equal(changed.status,200);
    assert.equal((await call('POST',verify,{})).status,404);
    assert.equal((await call('GET',route)).body.challenge,null);

    // Typing or pairing a domain never grants exclusive ownership.
    const contested=randomUUID()+'.example';
    const old=(await call('POST','/installations',{...input,domain:contested},users[0],{'idempotency-key':randomUUID()})).body.installation;
    const contender=(await call('POST','/installations',{...input,domain:contested},users[1],{'idempotency-key':randomUUID()})).body.installation;
    assert.ok(old.installation_id&&contender.installation_id);
    assert.equal((await pool.query('SELECT reserved_domain FROM installer.installations WHERE id=$1',[old.installation_id])).rows[0].reserved_domain,null);
    const ownerRoute='/installations/'+contender.installation_id+'/domain-challenges';
    const ownerProof=(await call('POST',ownerRoute,{},users[1],{'idempotency-key':randomUUID()})).body.challenge;
    expected=ownerProof.record_value;observed=true;
    assert.equal((await call('POST',ownerRoute+'/'+ownerProof.challenge_id+'/verify',{},users[1])).status,200);
    const oldRoute='/installations/'+old.installation_id+'/domain-challenges';
    const oldProof=(await call('POST',oldRoute,{},users[0],{'idempotency-key':randomUUID()})).body.challenge;
    expected=oldProof.record_value;
    assert.equal((await call('POST',oldRoute+'/'+oldProof.challenge_id+'/verify',{})).status,409,'An active verified lease is exclusive');
    await pool.query("UPDATE installer.installations SET claim_expires_at=now()-interval '1 second' WHERE id=$1",[contender.installation_id]);
    assert.equal((await call('POST',oldRoute+'/'+oldProof.challenge_id+'/verify',{})).status,200,'Fresh TXT proof can acquire an expired lease');
    assert.equal((await pool.query('SELECT reserved_domain FROM installer.installations WHERE id=$1',[old.installation_id])).rows[0].reserved_domain,contested);
    const before=(await pool.query('SELECT claim_expires_at,version FROM installer.installations WHERE id=$1',[old.installation_id])).rows[0];
    assert.equal((await call('PATCH','/installations/'+old.installation_id,{display_name:'Renamed',domain:contested},users[0],{'if-match':String(before.version)})).status,200);
    assert.equal((await pool.query('SELECT claim_expires_at FROM installer.installations WHERE id=$1',[old.installation_id])).rows[0].claim_expires_at.toISOString(),before.claim_expires_at.toISOString(),'Rename cannot renew domain ownership');
  } finally {await pool.end();}
});
