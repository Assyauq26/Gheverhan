import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp,writeFile,rm,readFile } from 'node:fs/promises';
import { generateKeyPair, exportJWK, calculateJwkThumbprint, SignJWT } from 'jose';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createArtifactDelivery} from '../src/artifact-delivery.mjs';
import { createPool, migrate } from '../src/db.mjs';
import { createHandler } from '../src/api.mjs';
import { createInstallReleaseHandler } from '../src/install-release.mjs';
import { hash, opaque } from '../src/common.mjs';

test('PostgreSQL release authorization binds verified owner/domain/device and monotonic reported progress',async()=>{
  const connection=process.env.JETSELLER_CONTROL_TEST_DATABASE_URL;
  if(process.env.JETSELLER_CONTROL_TEST_CONFIRM!=='isolated-control-fixture'||!connection)throw new Error('Explicit disposable control database required');
  const parsed=new URL(connection);
  assert.equal(parsed.pathname,'/js_control_fixture');assert.ok(['127.0.0.1','localhost'].includes(parsed.hostname));
  const pool=createPool(connection),controlOrigin='https://portal.release-fixture.example';
  const fixture=randomUUID(),installationId=randomUUID(),deviceId=randomUUID(),domain='release-'+fixture+'.example';
  const sellers=[];const artifactDirectory=await mkdtemp(path.join(tmpdir(),'p0-artifact-'));
  try {
    await migrate(pool);
    // Idempotent additive DDL only in the guarded disposable control database.
    await pool.query(await readFile(new URL('../migrations/002_install_release.sql',import.meta.url),'utf8'));
    const sessionKeys=await generateKeyPair('EdDSA',{crv:'Ed25519'}),agentKeys=await generateKeyPair('EdDSA',{crv:'Ed25519'});
    const deviceKeys=await generateKeyPair('EdDSA',{crv:'Ed25519'}),otherDevice=await generateKeyPair('EdDSA',{crv:'Ed25519'});
    const jwk=await exportJWK(deviceKeys.publicKey),thumbprint=await calculateJwkThumbprint(jwk),nonce=opaque();
    const sessionIssuer={issuer:controlOrigin,audience:'jetseller-portal',jwks:{keys:[await exportJWK(sessionKeys.publicKey)]}};
    for(let i=0;i<2;i++) {
      const sellerId=randomUUID(),sid=randomUUID(),csrf=opaque(),subject=fixture+':'+i;
      await pool.query('INSERT INTO installer.sellers(id,external_subject,email_verified) VALUES($1,$2,true)',[sellerId,subject]);
      await pool.query("INSERT INTO installer.sessions(id,seller_id,csrf_hash,expires_at,authenticated_at) VALUES($1,$2,$3,now()+interval '1 hour',now())",[sid,sellerId,hash(csrf)]);
      const token=await new SignJWT({sid,csrf,email_verified:true}).setProtectedHeader({alg:'EdDSA'}).setSubject(subject).setIssuer(controlOrigin).setAudience('jetseller-portal').setIssuedAt().setExpirationTime('1h').sign(sessionKeys.privateKey);
      sellers.push({sellerId,sid,csrf,token});
    }
    await pool.query(`INSERT INTO installer.installations(id,seller_id,display_name,domain,reserved_domain,claim_expires_at,status,client_request_id,request_hash)
      VALUES($1,$2,'Synthetic release store',$3,$3,now()+interval '24 hours','PAIRED',$4,$5)`,[installationId,sellers[0].sellerId,domain,randomUUID(),hash(fixture)]);
    await pool.query('INSERT INTO installer.devices(id,installation_id,public_jwk,thumbprint,nonce) VALUES($1,$2,$3,$4,$5)',[deviceId,installationId,jwk,thumbprint,nonce]);
    let catalog=null;
    const availableCatalog=()=>({version:1,release_id:'rel-1.0.0-internal',manifest_sha256:'a'.repeat(64),root_sha256:'b'.repeat(64),policy_sha256:'c'.repeat(64),
      release_bundle:{url:'https://releases.fixture.example/bundle.zip',sha256:'e'.repeat(64)},expires_at:new Date(Date.now()+600000).toISOString(),policy_url:'https://releases.fixture.example/policy.json',
      installer:{url:'https://releases.fixture.example/setup',sha256:'d'.repeat(64),signature_url:'https://releases.fixture.example/setup.sigstore.json'},
      verification_receipt:{status:'VERIFIED',release_id:'rel-1.0.0-internal',manifest_sha256:'a'.repeat(64),root_sha256:'b'.repeat(64),expires_at:new Date(Date.now()+900000).toISOString()}});
    let catalogOutage=false;
    const delivery=createArtifactDelivery({pool,controlOrigin,getCatalog:async()=>catalog,artifactDirectory});
    const installRelease=createInstallReleaseHandler({pool,issueDownloadGrant:delivery.issue,signingKey:agentKeys.privateKey,verificationKey:agentKeys.publicKey,controlOrigin,sessionIssuer,getCatalog:async()=>{
      if(catalogOutage)throw Error('Synthetic private publication service outage');return catalog;
    }});
    const handler=createHandler({pool,controlOrigin,sessionIssuer,signingKey:agentKeys.privateKey,verificationKey:agentKeys.publicKey,installRelease});
    const tokenFor=async(patch={})=>new SignJWT({installation_id:installationId,scopes:['report:heartbeat','release:read','install:progress'],cnf:{jkt:thumbprint},...patch})
      .setProtectedHeader({alg:'EdDSA',typ:'jetseller-agent+jwt'}).setSubject(deviceId).setIssuer(controlOrigin).setAudience('jetseller-agent-management').setJti(randomUUID()).setIssuedAt().setExpirationTime('10m').sign(agentKeys.privateKey);
    const token=await tokenFor();
    const proofFor=async({path,method='GET',raw='',proofPatch={},privateKey=deviceKeys.privateKey,credential=token}={})=>new SignJWT({htm:method,htu:controlOrigin+path,ath:Buffer.from(hash(credential),'hex').toString('base64url'),nonce,...(method==='POST'?{body_sha256:Buffer.from(hash(raw),'hex').toString('base64url')}:{}),...proofPatch})
      .setProtectedHeader({alg:'EdDSA',typ:'dpop+jwt'}).setIssuedAt().setJti(randomUUID()).sign(privateKey);
    const call=async(path,{method='GET',raw,proof,credential=token,seller}={})=>{
      const headers={'content-type':'application/json',...(seller?{cookie:'__Host-js_portal_session='+seller.token}:{authorization:'DPoP '+credential,...(proof?{dpop:proof}:{})})};
      const response=await handler(new Request(controlOrigin+path,{method,headers,...(raw!==undefined?{body:raw}:{})}),{clientAddress:'release-'+fixture});
      return {status:response.status,body:await response.json()};
    };
    const instruction='/api/installer/v1/installations/'+installationId+'/install-instructions',progress='/api/installer/v1/installations/'+installationId+'/install-progress';
    assert.equal((await call(instruction,{seller:sellers[1]})).status,404);
    assert.equal((await call(progress,{seller:sellers[1]})).status,404);
    assert.equal((await call(instruction,{credential:''})).status,401);
    assert.deepEqual((await call(instruction,{seller:sellers[0]})).body,{installation_id:installationId,available:false,reason:'RELEASE_UNAVAILABLE'});
    catalog=availableCatalog();
    const instructions=await call(instruction,{seller:sellers[0]});assert.equal(instructions.status,200);assert.equal(instructions.body.available,true);
    assert.equal(instructions.body.installer.sha256,catalog.installer.sha256);assert.equal(instructions.body.root_sha256,catalog.root_sha256);
    for(const expires_at of ['not-a-date',new Date(Date.now()-1000).toISOString()]) {
      const previous=catalog;catalog={...catalog,expires_at};assert.equal((await call(instruction,{seller:sellers[0]})).body.available,false);catalog=previous;
    }
    const authorization='/api/installer/v1/agent/install-authorization',report='/api/installer/v1/agent/install-progress';
    assert.equal((await call(authorization)).status,401);
    assert.equal((await call(authorization,{proof:await proofFor({path:authorization,privateKey:otherDevice.privateKey})})).status,401);
    assert.equal((await call(authorization,{proof:await proofFor({path:authorization,proofPatch:{nonce:'wrong'}})})).status,401);
    assert.equal((await call(authorization,{proof:await proofFor({path:authorization})})).body.error.code,'FRESH_DOMAIN_PROOF_REQUIRED');
    const challenge=randomUUID();
    await pool.query("INSERT INTO installer.domain_challenges(id,installation_id,client_request_id,domain,txt_value,expires_at,verified_at) VALUES($1,$2,$3,$4,$5,now()+interval '5 minutes',now())",[challenge,installationId,randomUUID(),domain,'jetseller-verification='+opaque()]);
    const authProof=await proofFor({path:authorization});const authorized=await call(authorization,{proof:authProof});assert.equal(authorized.status,200);
    assert.equal(authorized.body.installation_id,installationId);assert.equal(authorized.body.device_id,deviceId);assert.equal(authorized.body.domain,domain);assert.equal(authorized.body.display_name,"Synthetic release store");
    assert.equal(authorized.body.release_id,catalog.release_id);assert.equal(authorized.body.manifest_sha256,catalog.manifest_sha256);
    assert.ok(Date.parse(authorized.body.expires_at)>Date.now()&&Date.parse(authorized.body.expires_at)<=Date.now()+120000);
    assert.equal((await call(authorization,{proof:authProof})).status,409);
    const limitedToken=await tokenFor({scopes:['report:heartbeat']});
    assert.equal((await call(authorization,{credential:limitedToken,proof:await proofFor({path:authorization,credential:limitedToken})})).status,403);
    const wrongInstallation=await tokenFor({installation_id:randomUUID()});
    assert.equal((await call(authorization,{credential:wrongInstallation,proof:await proofFor({path:authorization,credential:wrongInstallation})})).status,401);
    await pool.query("UPDATE installer.domain_challenges SET expires_at=now()-interval '1 second',verified_at=now()-interval '2 seconds' WHERE id=$1",[challenge]);
    assert.equal((await call(authorization,{proof:await proofFor({path:authorization})})).body.error.code,'FRESH_DOMAIN_PROOF_REQUIRED');
    await pool.query("UPDATE installer.domain_challenges SET expires_at=now()+interval '45 seconds',verified_at=now() WHERE id=$1",[challenge]);
    const shortLease=await call(authorization,{proof:await proofFor({path:authorization})});assert.equal(shortLease.status,200);
    const expiry=(await pool.query('SELECT expires_at FROM installer.domain_challenges WHERE id=$1',[challenge])).rows[0].expires_at;
    assert.ok(Date.parse(shortLease.body.expires_at)<=new Date(expiry).getTime());
    await pool.query("UPDATE installer.installations SET claim_expires_at=now()-interval '1 second' WHERE id=$1",[installationId]);
    assert.equal((await call(authorization,{proof:await proofFor({path:authorization})})).body.error.code,'FRESH_DOMAIN_PROOF_REQUIRED');
    await pool.query("UPDATE installer.installations SET claim_expires_at=now()+interval '1 hour' WHERE id=$1",[installationId]);
    const payload={installation_id:installationId,release_id:catalog.release_id,manifest_sha256:catalog.manifest_sha256,phase:'PREFLIGHT',sequence:1,error_code:null};
    const send=async(patch={},proofPatch={})=>{const raw=JSON.stringify({...payload,...patch});return call(report,{method:'POST',raw,proof:await proofFor({path:report,method:'POST',raw,proofPatch})});};
    assert.equal((await send({}, {body_sha256:'wrong'})).status,401);
    assert.equal((await send({installation_id:randomUUID()})).status,400);
    assert.equal((await send({release_id:'rel-9.0.0-stable'})).status,409);
    assert.equal((await send({manifest_sha256:'f'.repeat(64)})).status,409);
    const raw=JSON.stringify(payload),firstProof=await proofFor({path:report,method:'POST',raw});
    assert.equal((await call(report,{method:'POST',raw,proof:firstProof})).status,200);
    assert.equal((await call(report,{method:'POST',raw,proof:firstProof})).status,409);
    assert.equal((await send()).status,200); // Idempotent retry has a fresh cryptographic proof.
    assert.equal((await send({phase:'LOCAL_READINESS',sequence:2})).status,409); // No skipped checkpoints.
    const phases=['VERIFIED_RELEASE','DATABASE','MIGRATION','APPLICATION','HTTPS_PENDING','LOCAL_READINESS'];
    for(let i=0;i<phases.length;i++)assert.equal((await send({phase:phases[i],sequence:i+2})).status,200);
    assert.equal((await send({phase:'DATABASE',sequence:8})).status,409);
    const reported=await call(progress,{seller:sellers[0]});assert.equal(reported.body.phase,'LOCAL_READINESS');
    assert.equal(reported.body.evidence_source,'DEVICE_REPORT_NOT_PUBLIC_TLS_ATTESTATION');
    assert.equal((await pool.query('SELECT status FROM installer.installations WHERE id=$1',[installationId])).rows[0].status,'PAIRED');
    assert.ok(!JSON.stringify(reported.body).includes('STORE_READY_TO_SELL'));
    catalogOutage=true;
    assert.equal((await call(authorization,{proof:await proofFor({path:authorization})})).status,503);
    assert.equal((await call(instruction,{seller:sellers[0]})).body.available,false);catalogOutage=false;
    // Durable approved device identity can refresh a short-lived management
    // credential without accepting an expired bearer or changing its UUID/key.
    const refreshPath='/agent/credential/refresh';
    const refreshProof=async()=>new SignJWT({nonce,operation:'refresh_installation_credential',request_hash:hash(JSON.stringify({installation_id:installationId,device_id:deviceId}))}).setProtectedHeader({alg:'EdDSA',typ:'jetseller-management+jwt'}).setAudience(controlOrigin).setIssuedAt().setExpirationTime('60s').setJti(randomUUID()).sign(deviceKeys.privateKey);
    const refresh=async(proof)=>{const r=await handler(new Request(controlOrigin+'/api/installer/v1'+refreshPath,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({installation_id:installationId,device_id:deviceId,proof})}),{clientAddress:'refresh-'+fixture});return {status:r.status,body:await r.json()};};
    const keyProof=await refreshProof(),refreshed=await refresh(keyProof);assert.equal(refreshed.status,200);assert.equal(refreshed.body.installation_id,installationId);assert.equal(refreshed.body.public_key_thumbprint,thumbprint);assert.equal((await refresh(keyProof)).status,409);
    // Real authenticated PoP issuance, one-use concurrent download, expiry,
    // current publication and device revocation checks. Synthetic bytes only.
    const artifactBytes=Buffer.alloc(256*1024,7),bundleSHA=hash(artifactBytes);
    await writeFile(path.join(artifactDirectory,bundleSHA+'.zip'),artifactBytes,{mode:0o600});
    catalog={...availableCatalog(),release_bundle:{delivery:'scoped',sha256:bundleSHA,bytes:artifactBytes.length}};
    const downloadAuthorization='/api/installer/v1/agent/release-download-authorization';
    const grant=async()=>{const r=await call(downloadAuthorization,{proof:await proofFor({path:downloadAuthorization})});assert.equal(r.status,200);assert.match(r.body.release_bundle_url,/\/bootstrap\/downloads\/[A-Za-z0-9_-]{43}$/);return r.body.release_bundle_url;};
    assert.equal((await call(authorization)).status,401);
    await writeFile(path.join(artifactDirectory,catalog.installer.sha256+'.setup'),Buffer.from('SYNTHETIC BOOTSTRAP DATA ONLY'),{mode:0o600});
    const bootstrapURL=controlOrigin+'/bootstrap/'+catalog.installer.sha256+'/jetseller-setup';
    const bootstrapResponse=await delivery.handle(new Request(bootstrapURL));assert.equal(bootstrapResponse.status,200);assert.equal(await bootstrapResponse.text(),'SYNTHETIC BOOTSTRAP DATA ONLY');
    assert.equal((await delivery.handle(new Request(controlOrigin+'/bootstrap/'+'0'.repeat(64)+'/jetseller-setup'))).status,404);
    const url=await grant();const fetched=await Promise.all([delivery.handle(new Request(url)),delivery.handle(new Request(url))]);
    assert.deepEqual(fetched.map(r=>r.status).sort(),[200,404]);
    assert.deepEqual(Buffer.from(await fetched.find(r=>r.status===200).arrayBuffer()),artifactBytes);
    assert.equal((await delivery.handle(new Request(url))).status,404);
    const expiredURL=await grant();await pool.query("UPDATE installer.download_grants SET expires_at=now()-interval '1 second' WHERE token_hash=$1",[hash(expiredURL.split('/').at(-1))]);assert.equal((await delivery.handle(new Request(expiredURL))).status,404);
    const changedURL=await grant();catalog={...catalog,manifest_sha256:'f'.repeat(64),verification_receipt:{...catalog.verification_receipt,manifest_sha256:'f'.repeat(64)}};assert.equal((await delivery.handle(new Request(changedURL))).status,404);
    catalog={...availableCatalog(),release_bundle:{delivery:'scoped',sha256:bundleSHA,bytes:artifactBytes.length}};
    const revokedURL=await grant();
    for(let i=0;i<8;i++){const r=await call(authorization,{proof:await proofFor({path:authorization})});assert.equal(r.status,200);assert.equal(r.body.release_bundle_url,null);} // Phase checks never mint or exhaust download grants.
    await pool.query('UPDATE installer.devices SET revoked_at=now() WHERE id=$1',[deviceId]);
    assert.equal((await delivery.handle(new Request(revokedURL))).status,404);
    assert.equal((await call(authorization,{proof:await proofFor({path:authorization})})).status,401);
    assert.equal((await send({phase:'LOCAL_READINESS',sequence:8})).status,401);
    assert.equal((await refresh(await refreshProof())).status,401);
  }finally {
    // Delete only fixture-owned rows from an explicitly isolated local database.
    await pool.query('DELETE FROM installer.download_grants WHERE installation_id=$1',[installationId]).catch(()=>{});
    await rm(artifactDirectory,{recursive:true,force:true});
    await pool.query('DELETE FROM installer.install_progress WHERE installation_id=$1',[installationId]).catch(()=>{});
    await pool.query('DELETE FROM installer.devices WHERE installation_id=$1',[installationId]).catch(()=>{});
    await pool.query('DELETE FROM installer.domain_challenges WHERE installation_id=$1',[installationId]).catch(()=>{});
    await pool.query('DELETE FROM installer.installations WHERE id=$1',[installationId]).catch(()=>{});
    for(const seller of sellers){await pool.query('DELETE FROM installer.sessions WHERE seller_id=$1',[seller.sellerId]).catch(()=>{});await pool.query('DELETE FROM installer.sellers WHERE id=$1',[seller.sellerId]).catch(()=>{});}
    await pool.end();
  }
});
