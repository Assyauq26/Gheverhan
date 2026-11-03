import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createPool, migrate } from '../src/db.mjs';
import { createHandler } from '../src/api.mjs';
import { hash, opaque } from '../src/common.mjs';

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
      await pool.query("INSERT INTO installer.sessions(id,seller_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[sid,seller,hash(csrf)]);
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
    const results=await Promise.all([call('POST',verify,{}),call('POST',verify,{})]);assert.deepEqual(results.map(r=>r.status),[200,200]);
    assert.ok(results.every(r=>r.body.challenge.status==='OWNERSHIP_VERIFIED'&&r.body.challenge.https_verified===false&&r.body.challenge.installed===false));
    assert.equal(results[0].body.challenge.verified_at,results[1].body.challenge.verified_at);
    assert.equal((await call('GET',route)).body.challenge.status,'OWNERSHIP_VERIFIED');
    const newer=(await call('POST',route,{},users[0],{'idempotency-key':randomUUID()})).body.challenge;
    await pool.query("UPDATE installer.domain_challenges SET expires_at=now()-interval '1 second' WHERE id=$1",[newer.challenge_id]);
    assert.equal((await call('POST',route+'/'+newer.challenge_id+'/verify',{})).status,410);
    const changed=await call('PATCH','/installations/'+installation.installation_id,{display_name:input.display_name,domain:randomUUID()+'.example'},users[0],{'if-match':String(installation.version)});assert.equal(changed.status,200);
    assert.equal((await call('POST',verify,{})).status,404);
    assert.equal((await call('GET',route)).body.challenge,null);
  } finally {await pool.end();}
});
