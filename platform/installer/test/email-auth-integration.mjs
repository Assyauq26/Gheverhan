import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createServer as createHttpsServer,request as httpsRequest } from 'node:https';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { generateKeyPair,exportJWK } from 'jose';
import { createPool,migrate } from '../src/db.mjs';
import { createEmailAuthHandler } from '../src/email-auth.mjs';
import { createHandler } from '../src/api.mjs';
import { hash } from '../src/common.mjs';

test('real PostgreSQL plus trusted local HTTPS Resend adapter: email OTP directly creates revocable seller session',async()=>{
  const connection=process.env.JETSELLER_CONTROL_TEST_DATABASE_URL;
  if(process.env.JETSELLER_CONTROL_TEST_CONFIRM!=='isolated-control-fixture'||!connection)throw Error('Explicit disposable control fixture required');
  const url=new URL(connection);assert.equal(url.pathname,'/js_control_fixture');assert.ok(['127.0.0.1','localhost'].includes(url.hostname));
  const pool=createPool(connection),controlOrigin='https://email.portal.fixture.example',prefix=randomUUID();
  const directory=await mkdtemp(path.join(os.tmpdir(),'p0-email-https-'));
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(directory,'key.pem'),'-out',path.join(directory,'cert.pem'),'-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1','-days','1'],{stdio:'ignore'});
  const cert=await readFile(path.join(directory,'cert.pem')),key=await readFile(path.join(directory,'key.pem'));
  const deliveries=new Map();let providerFailure=false;
  const provider=createHttpsServer({key,cert},async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    assert.equal(req.url,'/emails');assert.equal(req.method,'POST');assert.equal(req.headers.authorization,'Bearer synthetic-resend-key');
    if(providerFailure){res.writeHead(503).end('{}');return;}
    const body=JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(body.subject,'Kode masuk Buat Toko Online Sendiri');
    assert.match(body.from,/Buat Toko Online Sendiri/);
    const code=body.text.match(/: (\d{6})\n/)?.[1];assert.ok(code);deliveries.set(body.to[0],code);
    res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({id:randomUUID()}));
  });
  await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
  const local='https://127.0.0.1:'+provider.address().port;
  // The application still addresses the fixed Resend URL. Only the guarded
  // test transport remaps the wire connection to an explicitly trusted CA.
  const transport=(endpoint,init)=>new Promise((resolve,reject)=>{
    assert.equal(endpoint,'https://api.resend.com/emails');assert.equal(init.redirect,'error');
    const request=httpsRequest(local+'/emails',{method:init.method,headers:init.headers,ca:cert,rejectUnauthorized:true,signal:init.signal},response=>{
      const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:response.statusCode})));
    });request.on('error',reject);request.end(init.body);
  });
  try {
    await migrate(pool);await pool.query(await readFile(new URL('../migrations/003_email_auth.sql',import.meta.url),'utf8'));
    const sessionKeys=await generateKeyPair('EdDSA',{crv:'Ed25519'}),agentKeys=await generateKeyPair('EdDSA',{crv:'Ed25519'});
    const config={resendApiKey:'synthetic-resend-key',otpPepper:'a'.repeat(64),from:'Buat Toko Online Sendiri <noreply@fixture.example>',sessionSigningKey:sessionKeys.privateKey};
    const emailAuth=createEmailAuthHandler({pool,controlOrigin,config,fetchImpl:transport});
    const sessionIssuer={issuer:controlOrigin,audience:'jetseller-portal',jwks:{keys:[await exportJWK(sessionKeys.publicKey)]}};
    const api=createHandler({pool,controlOrigin,sessionIssuer,signingKey:agentKeys.privateKey,verificationKey:agentKeys.publicKey});
    const start=async(tag,mode='register',patch={})=>{
      const email=tag+'-'+prefix+'@fixture.example';
      const response=await emailAuth(new Request(controlOrigin+'/auth/email/start',{method:'POST',headers:{origin:controlOrigin,'content-type':'application/json'},body:JSON.stringify({mode,email,...(mode==='register'?{name:'Synthetic Seller',store_name:'Synthetic Store'}:{}),...patch})}),{clientAddress:'email-'+tag+'-'+prefix});
      return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0],email};
    };
    const verify=async(flow,code=deliveries.get(flow.email),patch={})=>emailAuth(new Request(controlOrigin+'/auth/email/verify',{method:'POST',headers:{origin:controlOrigin,'content-type':'application/json',cookie:flow.cookie??''},body:JSON.stringify({challenge_id:flow.body.challenge_id,code,...patch})}),{clientAddress:'verify-'+flow.email});
    const call=async(route,cookie,{method='GET',body,csrf,origin=controlOrigin}={})=>{
      const response=await api(new Request(controlOrigin+'/api/installer/v1'+route,{method,headers:{cookie,...(method==='POST'?{origin,'x-csrf-token':csrf??'','content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}),{clientAddress:'api-'+prefix});
      return {status:response.status,body:await response.json(),headers:response.headers};
    };
    const first=await start('owner');assert.equal(first.status,200);assert.equal(first.body.status,'OTP_SENT');
    const row=(await pool.query('SELECT * FROM installer.email_challenges WHERE id=$1',[first.body.challenge_id])).rows[0];
    assert.notEqual(row.code_hash,deliveries.get(first.email));assert.match(row.code_hash,/^[a-f0-9]{64}$/);assert.ok(row.delivered_at);assert.equal(row.attempts,0);
    assert.equal((await start('owner')).status,429);
    const wrongCookie={...first,cookie:'__Host-js_email_flow='+ 'x'.repeat(43)};
    assert.equal((await verify(wrongCookie)).status,401);
    const consumed=await Promise.all([verify(first),verify(first),verify(first)]);assert.deepEqual(consumed.map(r=>r.status).sort(),[200,401,401]);
    const authenticated=consumed.find(r=>r.status===200);assert.deepEqual(await authenticated.json(),{status:'AUTHENTICATED'});
    const cookie=authenticated.headers.getSetCookie().find(v=>v.startsWith('__Host-js_portal_session=')).split(';')[0];
    assert.match(authenticated.headers.get('set-cookie'),/HttpOnly/);assert.match(authenticated.headers.get('set-cookie'),/Secure/);
    const session=await call('/session',cookie);assert.equal(session.status,200);assert.equal(session.body.authenticated,true);assert.ok(session.body.csrf_token);
    const sellerId=session.body.seller_id;
    const seller=(await pool.query('SELECT email_verified,display_name,store_name FROM installer.sellers WHERE id=$1',[sellerId])).rows[0];
    assert.equal(seller.email_verified,true);assert.equal(seller.display_name,'Synthetic Seller');assert.equal(seller.store_name,'Synthetic Store');
    const input={display_name:'Synthetic Store',domain:'otp-'+prefix+'.example',profile:'fresh_vps_ubuntu_amd64',requested_install_version:'stable'};
    // Same session proceeds directly into the existing wizard/control API.
    const createdResponse=await api(new Request(controlOrigin+'/api/installer/v1/installations',{method:'POST',headers:{origin:controlOrigin,cookie,'x-csrf-token':session.body.csrf_token,'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify(input)}),{clientAddress:'create-'+prefix});
    assert.equal(createdResponse.status,201);const installation=(await createdResponse.json()).installation;
    assert.equal((await call('/session/logout',cookie,{method:'POST',body:{},csrf:session.body.csrf_token,origin:'https://evil.example'})).status,403);
    const signedOut=await call('/session/logout',cookie,{method:'POST',body:{},csrf:session.body.csrf_token});assert.equal(signedOut.status,200);assert.match(signedOut.headers.get('set-cookie'),/Max-Age=0/);
    assert.equal((await call('/session',cookie)).status,401);
    await pool.query("UPDATE installer.email_challenges SET created_at=now()-interval '61 seconds' WHERE id=$1",[first.body.challenge_id]);
    const returning=await start('owner','login');assert.equal(returning.status,200);
    const returnVerified=await verify(returning);assert.equal(returnVerified.status,200);
    const returnCookie=returnVerified.headers.getSetCookie().find(v=>v.startsWith('__Host-js_portal_session=')).split(';')[0];
    assert.equal((await call('/session',returnCookie)).body.seller_id,sellerId);
    assert.ok((await call('/installations',returnCookie)).body.installations.some(i=>i.installation_id===installation.installation_id));
    const unknown=await start('unknown','login');assert.equal(unknown.status,200);assert.deepEqual(Object.keys(unknown.body).sort(),Object.keys(returning.body).sort());
    assert.equal((await verify(unknown)).status,409); // Profile required only after mailbox possession proof.
    const attempts=await start('attempts');let invalid=deliveries.get(attempts.email)==='000000'?'000001':'000000';
    for(let n=0;n<5;n++)assert.equal((await verify(attempts,invalid)).status,401);
    assert.equal((await verify(attempts)).status,401);
    assert.equal((await pool.query('SELECT attempts FROM installer.email_challenges WHERE id=$1',[attempts.body.challenge_id])).rows[0].attempts,5);
    const expired=await start('expiry');await pool.query("UPDATE installer.email_challenges SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.body.challenge_id]);assert.equal((await verify(expired)).status,410);
    providerFailure=true;const failed=await start('provider-failure');assert.equal(failed.status,503);assert.equal(failed.body.error.code,'AUTH_UNAVAILABLE');
    const currentSession=await call('/session',returnCookie);
    await pool.query("UPDATE installer.sessions SET authenticated_at=now()-interval '6 minutes' WHERE seller_id=$1",[sellerId]);
    const stale=await call('/installations/'+installation.installation_id+'/unpair',returnCookie,{method:'POST',body:{},csrf:currentSession.body.csrf_token});assert.equal(stale.status,403);assert.equal(stale.body.error.code,'REAUTHENTICATION_REQUIRED');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM installer.sellers WHERE email_hash=$1',[hash('email-auth:'+first.email)])).rows[0].n,1);
  }finally {await new Promise(resolve=>provider.close(resolve));await pool.end();}
});
