import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateKeyPair,exportJWK,SignJWT,jwtVerify,calculateJwkThumbprint } from 'jose';
import { createPool,migrate } from '../src/db.mjs';
import { createHandler } from '../src/api.mjs';
import { hash,opaque } from '../src/common.mjs';
import { createControlServer } from '../src/server.mjs';

test('real isolated PostgreSQL ownership, durability, atomic pairing, proof binding and revocation',async()=>{
 const connection=process.env.JETSELLER_CONTROL_TEST_DATABASE_URL;
 if(process.env.JETSELLER_CONTROL_TEST_CONFIRM!=='isolated-control-fixture'||!connection)throw new Error('Isolated test database required; never fall back to DATABASE_URL');
 const url=new URL(connection);
 assert.equal(url.pathname,'/js_control_fixture');assert.ok(['127.0.0.1','localhost'].includes(url.hostname));
 const pool=createPool(connection);
 try{
  await migrate(pool);await migrate(pool);
  const issuer='https://identity.fixture.example',controlOrigin='https://portal.fixture.example';
  const authKeys=await generateKeyPair('EdDSA',{crv:'Ed25519'}),agentSigner=await generateKeyPair('EdDSA',{crv:'Ed25519'});
  const publicJwk=await exportJWK(authKeys.publicKey);
  const options={pool,controlOrigin,sessionIssuer:{issuer,audience:'jetseller-portal',jwks:{keys:[publicJwk]}},signingKey:agentSigner.privateKey,verificationKey:agentSigner.publicKey};
  let handler=createHandler(options);
  const users=[];
  for(let i=0;i<2;i++){
   const seller=randomUUID(),sid=randomUUID(),csrf=opaque(),subject='fixture-'+randomUUID();
   await pool.query('INSERT INTO installer.sellers(id,external_subject,email_verified) VALUES($1,$2,true)',[seller,subject]);
   await pool.query("INSERT INTO installer.sessions(id,seller_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[sid,seller,hash(csrf)]);
   const token=await new SignJWT({sid,csrf,email_verified:true}).setProtectedHeader({alg:'EdDSA'}).setSubject(subject).setIssuer(issuer).setAudience('jetseller-portal').setIssuedAt().setExpirationTime('1h').sign(authKeys.privateKey);
   users.push({seller,sid,csrf,token});
  }
  const [a,b]=users;
  const call=async(method,path,data,user=a,extra={})=>{
   const headers={'content-type':'application/json',origin:controlOrigin,...(user?{cookie:'__Host-js_portal_session='+user.token,'x-csrf-token':user.csrf}:{}),...extra};
   const req=new Request(controlOrigin+'/api/installer/v1'+path,{method,headers,...(data!==undefined?{body:JSON.stringify(data)}:{})});
   const response=await handler(req,{clientAddress:'fixture-'+(user?.seller??'device')});
   return {status:response.status,body:await response.json()};
  };
  const input={display_name:'Synthetic Store',domain:'store-'+randomUUID()+'.example',profile:'fresh_vps_ubuntu_amd64',requested_install_version:'stable'};
  const idempotency=randomUUID();
  const created=await call('POST','/installations',input,a,{'idempotency-key':idempotency});assert.equal(created.status,201);const installation=created.body.installation;
  assert.equal((await call('POST','/installations',input,a,{'idempotency-key':idempotency})).body.installation.installation_id,installation.installation_id);
  assert.equal((await call('POST','/installations',{...input,display_name:'Changed'},a,{'idempotency-key':idempotency})).status,409);
  assert.equal((await call('POST','/installations',input,b,{'idempotency-key':randomUUID()})).status,409);
  assert.equal((await call('GET','/installations/'+installation.installation_id,undefined,b)).status,404);
  assert.deepEqual((await call('GET','/installations',undefined,b)).body.installations,[]);
  assert.equal((await call('GET','/installations',undefined,null)).status,401);
  assert.equal((await call('POST','/installations',input,a,{'x-csrf-token':'wrong','idempotency-key':randomUUID()})).status,403);
  assert.equal((await call('PATCH','/installations/'+installation.installation_id,{display_name:'Changed',domain:input.domain},a,{'if-match':'99'})).status,409);
  assert.equal((await call('PATCH','/installations/'+installation.installation_id,{display_name:'Changed',domain:input.domain},a,{'if-match':'1'})).status,200);
  handler=createHandler(options); // Fresh service instance reads durable registry and sessions.
  assert.equal((await call('GET','/installations/'+installation.installation_id)).body.installation.display_name,'Changed');
  const keys=await generateKeyPair('EdDSA',{crv:'Ed25519',extractable:true}),jwk=await exportJWK(keys.publicKey),thumbprint=await calculateJwkThumbprint(jwk);
  const deviceRequest={installation_hint:installation.installation_id,public_key:jwk,protocol_version:'1',os:'ubuntu-24.04',arch:'amd64',agent_version:'0.1.0'};
  const pair=await call('POST','/agent/pairing/device',deviceRequest,null);assert.equal(pair.status,201);const session=pair.body;
  assert.equal(JSON.stringify((await call('GET','/installations')).body).includes(session.device_code),false);
  const proof=async(privateKey=keys.privateKey,patch={})=>new SignJWT({nonce:session.nonce,operation:'pairing-token',code_hash:hash(session.device_code),...patch}).setProtectedHeader({alg:'EdDSA',typ:'jetseller-pairing+jwt'}).setAudience(controlOrigin).setIssuedAt().setExpirationTime('60s').setJti(randomUUID()).sign(privateKey);
  const poll=async(token)=>call('POST','/agent/pairing/token',{device_code:session.device_code,proof:token??await proof()},null);
  const firstProof=await proof();assert.equal((await poll(firstProof)).status,202);assert.equal((await poll(firstProof)).status,409);
  assert.equal((await poll()).status,429);
  const wrong=await generateKeyPair('EdDSA',{crv:'Ed25519'});assert.equal((await poll(await proof(wrong.privateKey))).status,401);
  assert.equal((await poll(await proof(keys.privateKey,{nonce:'wrong'}))).status,401);
  assert.equal((await call('POST','/pairing-sessions/lookup',{user_code:session.user_code},b)).status,404);
  const lookup=await call('POST','/pairing-sessions/lookup',{user_code:session.user_code});assert.equal(lookup.status,200);assert.equal(lookup.body.public_key_thumbprint,thumbprint);
  const approval={user_code:session.user_code,public_key_thumbprint:thumbprint,confirm:true};
  assert.equal((await call('POST','/pairing-sessions/'+session.pairing_session_id+'/approve',approval,b)).status,404);
  assert.equal((await call('POST','/pairing-sessions/'+session.pairing_session_id+'/approve',{...approval,public_key_thumbprint:'wrong'})).status,403);
  const approvals=await Promise.all([call('POST','/pairing-sessions/'+session.pairing_session_id+'/approve',approval),call('POST','/pairing-sessions/'+session.pairing_session_id+'/approve',approval)]);
  assert.deepEqual(approvals.map(x=>x.status).sort(),[200,409]);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM installer.devices WHERE installation_id=$1',[installation.installation_id])).rows[0].n,1);
  await pool.query("UPDATE installer.pairing_sessions SET last_poll_at=now()-interval '6 seconds' WHERE id=$1",[session.pairing_session_id]);
  // Seller consent may precede first credential delivery by several minutes.
  // The lost-response retry window must begin at issuance, not approval time.
  await pool.query("UPDATE installer.devices SET created_at=now()-interval '3 minutes' WHERE installation_id=$1",[installation.installation_id]);
  const bound=await poll();assert.equal(bound.status,200);const issued=bound.body;
  const verified=await jwtVerify(issued.credential,agentSigner.publicKey,{issuer:controlOrigin,audience:'jetseller-agent-management'});
  assert.equal(verified.payload.cnf.jkt,thumbprint);assert.equal(issued.installation_id,installation.installation_id);
  assert.equal((await poll()).body.device_id,issued.device_id); // Lost-response recovery cannot create another device.
  const issuedAt=(await pool.query('SELECT credential_issued_at FROM installer.pairing_sessions WHERE id=$1',[session.pairing_session_id])).rows[0].credential_issued_at;
  assert.ok(new Date(issuedAt).getTime()>Date.now()-30000);
  const detail=(await call('GET','/installations/'+installation.installation_id)).body.installation;
  const listed=(await call('GET','/installations')).body.installations.find(row=>row.installation_id===installation.installation_id);
  assert.equal(detail.device_id,issued.device_id);assert.equal(detail.device_id,listed.device_id);
  await pool.query("UPDATE installer.pairing_sessions SET credential_issued_at=now()-interval '3 minutes' WHERE id=$1",[session.pairing_session_id]);
  assert.equal((await poll()).body.error.code,'PAIR_ALREADY_USED');
  const identityPath=controlOrigin+'/api/installer/v1/agent/identity';
  const dpop=async(privateKey=keys.privateKey)=>new SignJWT({htm:'GET',htu:identityPath,ath:Buffer.from(hash(issued.credential),'hex').toString('base64url'),nonce:issued.management_nonce}).setProtectedHeader({alg:'EdDSA',typ:'dpop+jwt'}).setIssuedAt().setJti(randomUUID()).sign(privateKey);
  const identity=async(p)=>call('GET','/agent/identity',undefined,null,{authorization:'DPoP '+issued.credential,...(p?{dpop:p}:{})});
  assert.equal((await identity()).status,401); // Token alone never authenticates.
  assert.equal((await identity(await dpop(wrong.privateKey))).status,401);
  const requestProof=await dpop();assert.equal((await identity(requestProof)).status,200);assert.equal((await identity(requestProof)).status,409);
  const futureIat=Math.floor(Date.now()/1000)+5,futureJti=randomUUID();
  const futureProof=await new SignJWT({htm:'GET',htu:identityPath,ath:Buffer.from(hash(issued.credential),'hex').toString('base64url'),nonce:issued.management_nonce}).setProtectedHeader({alg:'EdDSA',typ:'dpop+jwt'}).setIssuedAt(futureIat).setJti(futureJti).sign(keys.privateKey);
  assert.equal((await identity(futureProof)).status,200);
  const replay=(await pool.query('SELECT expires_at FROM installer.proof_replays WHERE thumbprint=$1 AND jti_hash=$2',[thumbprint,hash(futureJti)])).rows[0];
  assert.ok(new Date(replay.expires_at).getTime()>=(futureIat+65)*1000,'Replay record must cover complete accepted proof lifetime including future clock tolerance');
  assert.equal((await identity(futureProof)).status,409);
  // Renewal is permitted *before expiry* only: a new PoP-bound credential
  // requires a fresh proof for the specific POST endpoint and does not elevate
  // scopes or create a new device.
  const renewalPath=controlOrigin+'/api/installer/v1/agent/credential/renew';
  const renewalProof=async(token=issued.credential,privateKey=keys.privateKey,patch={})=>
    new SignJWT({htm:'POST',htu:renewalPath,
      ath:Buffer.from(hash(token),'hex').toString('base64url'),
      nonce:issued.management_nonce,...patch})
      .setProtectedHeader({alg:'EdDSA',typ:'dpop+jwt'})
      .setIssuedAt().setJti(randomUUID()).sign(privateKey);
  const renew=async(proof,token=issued.credential,body={})=>call('POST','/agent/credential/renew',body,null,{
    authorization:'DPoP '+token,...(proof?{dpop:proof}:{})
  });
  assert.equal((await renew()).status,401);
  assert.equal((await renew(await renewalProof(issued.credential,wrong.privateKey))).status,401);
  assert.equal((await renew(await renewalProof(issued.credential,keys.privateKey,{htm:'GET'}))).status,401);
  assert.equal((await renew(await renewalProof(issued.credential,keys.privateKey,{htu:identityPath}))).status,401);
  const renewalRequestProof=await renewalProof();
  const refreshed=await renew(renewalRequestProof);
  assert.equal(refreshed.status,200);
  assert.notEqual(refreshed.body.credential,issued.credential);
  assert.equal(refreshed.body.installation_id,issued.installation_id);
  assert.equal(refreshed.body.device_id,issued.device_id);
  assert.deepEqual(refreshed.body.scopes,issued.scopes);
  const verifiedRefresh=await jwtVerify(refreshed.body.credential,agentSigner.publicKey,{
    issuer:controlOrigin,audience:'jetseller-agent-management'
  });
  assert.equal(verifiedRefresh.payload.cnf.jkt,thumbprint);
  assert.ok(verifiedRefresh.payload.exp-verifiedRefresh.payload.iat<=600);
  assert.equal((await renew(renewalRequestProof)).status,409);
  const renewedAgain=await renew(await renewalProof(refreshed.body.credential),refreshed.body.credential);
  assert.equal(renewedAgain.status,200);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM installer.devices WHERE installation_id=$1',[installation.installation_id])).rows[0].n,1);
  assert.equal((await call('POST','/installations/'+installation.installation_id+'/unpair',{})).status,200);
  assert.equal((await identity(await dpop())).status,401);assert.equal((await poll()).status,403);
  assert.equal((await renew(await renewalProof(refreshed.body.credential),refreshed.body.credential)).status,401);
  const expired=await call('POST','/agent/pairing/device',deviceRequest,null);assert.equal(expired.status,201);
  await pool.query("UPDATE installer.pairing_sessions SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.body.pairing_session_id]);
  const expiredPoll=await call('POST','/agent/pairing/token',{device_code:expired.body.device_code,proof:'unused'},null);assert.equal(expiredPoll.status,410);
  const unverified=await new SignJWT({sid:a.sid,csrf:a.csrf,email_verified:false}).setProtectedHeader({alg:'EdDSA'}).setSubject('fixture').setIssuer(issuer).setAudience('jetseller-portal').setIssuedAt().setExpirationTime('1h').sign(authKeys.privateKey);
  assert.equal((await call('GET','/session',undefined,{...a,token:unverified})).status,403);
  await pool.query('UPDATE installer.sessions SET revoked_at=now() WHERE id=$1',[a.sid]);assert.equal((await call('GET','/session')).status,401);
  handler=createHandler({...options,sessionIssuer:undefined});assert.equal((await call('GET','/session')).status,503);
  // Real HTTP control routes + synthetic issuer transport. No provider account,
  // public DNS, email or production endpoint is involved.
  const portalSigner=await generateKeyPair('EdDSA',{crv:'Ed25519'});
  const portalJwk=await exportJWK(portalSigner.publicKey);
  let authNonce,challenge,exchanges=0,verifiedEmail=true;
  const oidc={issuer,clientId:'fixture-client',authorizationEndpoint:issuer+'/authorize',tokenEndpoint:issuer+'/token',redirectUri:controlOrigin+'/auth/callback',jwks:{keys:[publicJwk]},sessionSigningKey:portalSigner.privateKey};
  const server=createControlServer({...options,sessionIssuer:{issuer:controlOrigin,audience:'jetseller-portal',jwks:{keys:[portalJwk]}},oidc},pool,{oidcFetch:async(endpoint,init)=>{
   assert.equal(endpoint,oidc.tokenEndpoint);assert.equal(init.redirect,'error');assert.equal(init.method,'POST');
   const params=new URLSearchParams(init.body);assert.equal(params.get('grant_type'),'authorization_code');assert.equal(params.get('client_id'),oidc.clientId);
   assert.equal(Buffer.from(hash(params.get('code_verifier')),'hex').toString('base64url'),challenge);
   exchanges++;
   return Response.json({id_token:await new SignJWT({nonce:authNonce,email_verified:verifiedEmail}).setProtectedHeader({alg:'EdDSA'}).setSubject('verified-fixture-account').setIssuer(issuer).setAudience(oidc.clientId).setIssuedAt().setExpirationTime('5m').sign(authKeys.privateKey)});
  }});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try{
   assert.deepEqual(await (await fetch(base+'/auth/status')).json(),{configured:true,login_url:'/auth/login'});
   const login=await fetch(base+'/auth/login',{redirect:'manual'});assert.equal(login.status,302);
   const authorization=new URL(login.headers.get('location'));assert.equal(authorization.origin,issuer);
   assert.equal(authorization.searchParams.get('code_challenge_method'),'S256');assert.equal(authorization.searchParams.get('redirect_uri'),oidc.redirectUri);
   authNonce=authorization.searchParams.get('nonce');challenge=authorization.searchParams.get('code_challenge');
   const loginCookie=login.headers.getSetCookie()[0].split(';')[0];assert.ok(login.headers.get('set-cookie').includes('HttpOnly'));
   const callback='/auth/callback?code=synthetic-fixture-code&state='+authorization.searchParams.get('state');
   assert.equal((await fetch(base+callback.replace('state=','state=wrong'),{redirect:'manual',headers:{cookie:loginCookie}})).status,400);
   const complete=await fetch(base+callback,{redirect:'manual',headers:{cookie:loginCookie}});assert.equal(complete.status,302);assert.equal(complete.headers.get('location'),'/');assert.equal(exchanges,1);
   const sessionCookie=complete.headers.getSetCookie().find(value=>value.startsWith('__Host-js_portal_session=')).split(';')[0];
   assert.equal((await fetch(base+callback,{redirect:'manual',headers:{cookie:loginCookie}})).status,400);assert.equal(exchanges,1);
   const session=await (await fetch(base+'/api/installer/v1/session',{headers:{cookie:sessionCookie}})).json();assert.equal(session.authenticated,true);assert.ok(session.csrf_token);
   const create=await fetch(base+'/api/installer/v1/installations',{method:'POST',headers:{cookie:sessionCookie,origin:controlOrigin,'x-csrf-token':session.csrf_token,'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify({...input,domain:'oidc-'+randomUUID()+'.example'})});assert.equal(create.status,201);
   const logout=await fetch(base+'/api/installer/v1/session/logout',{method:'POST',headers:{cookie:sessionCookie,origin:controlOrigin,'x-csrf-token':session.csrf_token,'content-type':'application/json'},body:'{}'});assert.equal(logout.status,200);
   assert.equal((await fetch(base+'/api/installer/v1/session',{headers:{cookie:sessionCookie}})).status,401);
   verifiedEmail=false;
   const deniedLogin=await fetch(base+'/auth/login',{redirect:'manual'});const deniedAuthorization=new URL(deniedLogin.headers.get('location'));
   authNonce=deniedAuthorization.searchParams.get('nonce');challenge=deniedAuthorization.searchParams.get('code_challenge');
   const denied=await fetch(base+'/auth/callback?code=synthetic-denied&state='+deniedAuthorization.searchParams.get('state'),{redirect:'manual',headers:{cookie:deniedLogin.headers.getSetCookie()[0].split(';')[0]}});assert.equal(denied.status,403);
  }finally{await new Promise(resolve=>server.close(resolve));}
  handler=createHandler(options);
  // Different domains/idempotency keys must still share a seller-scoped limit lock.
  for(let n=0;n<19;n++)assert.equal((await call('POST','/installations',{...input,domain:'limit-'+randomUUID()+'.example'},b,{'idempotency-key':randomUUID()})).status,201);
  const limitRace=await Promise.all([0,1].map(()=>call('POST','/installations',{...input,domain:'limit-'+randomUUID()+'.example'},b,{'idempotency-key':randomUUID()})));
  assert.deepEqual(limitRace.map(r=>r.status).sort(),[201,409]);
  assert.equal(limitRace.find(r=>r.status===409).body.error.code,'INSTALLATION_LIMIT');
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM installer.installations WHERE seller_id=$1 AND status<>'CANCELLED'",[b.seller])).rows[0].n,20);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('User','Order','Product')")).rows[0].n,0);
 }finally{await pool.end();}
});
