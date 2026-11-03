import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync,execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:https';
import {once} from 'node:events';
import {exportJWK,jwtVerify,SignJWT} from 'jose';
import {randomUUID} from 'node:crypto';
import {fixture} from './lifecycle-fixture.mjs';
const execute=promisify(execFile);
test('actual Go CLI persists key-bound refresh, rotation crash recovery and revocation against HTTPS plus PostgreSQL',{timeout:120000},async t=>{
 const binary=process.env.JETSELLER_LIFECYCLE_CLI_BINARY;assert.ok(binary&&path.isAbsolute(binary));assert.equal(process.platform,'linux');
 const directory=await mkdtemp(path.join(tmpdir(),'jetseller-lifecycle-'));const state=path.join(directory,'state');await mkdir(state,{mode:0o700});
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1','-keyout',path.join(directory,'key.pem'),'-out',path.join(directory,'ca.pem')],{stdio:'ignore'});
 let f,dropRefresh=true,dropRotation=false;
 const server=createServer({key:await readFile(path.join(directory,'key.pem')),cert:await readFile(path.join(directory,'ca.pem'))},async(req,res)=>{
  try{
   const chunks=[];for await(const c of req)chunks.push(c);const request=new Request(f.origin+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});const response=await f.handler(request,{clientAddress:'cli-'+f.installation.installation_id});
   if(req.url.endsWith('/credentials/refresh')&&dropRefresh&&response.status===200){dropRefresh=false;req.socket.destroy();return;}
   if(req.url.endsWith('/credentials/rotate')&&dropRotation&&response.status===200){dropRotation=false;req.socket.destroy();return;}
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(503).end();}
 });server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
 f=await fixture(t,{controlOrigin:'https://127.0.0.1:'+server.address().port});
 const jwk=await exportJWK(f.keys.privateKey),identity={installation_id:f.installation.installation_id,seed:jwk.d};
 const oldToken=await new SignJWT({installation_id:identity.installation_id,scopes:f.credential.scopes,cnf:{jkt:f.credential.public_key_thumbprint}}).setProtectedHeader({alg:'EdDSA',typ:'jetseller-agent+jwt'}).setIssuer(f.origin).setAudience('jetseller-agent-management').setSubject(f.credential.device_id).setJti(randomUUID()).setIssuedAt(Math.floor(Date.now()/1000)-1200).setExpirationTime(Math.floor(Date.now()/1000)-600).sign(f.signer.privateKey);
 const privateWrite=(name,value)=>writeFile(path.join(state,name),JSON.stringify(value)+'\n',{mode:0o600});
 await privateWrite('identity.json',identity);await privateWrite('journal.json',{version:1,installation_id:identity.installation_id,sequence:4,phase:'PAIRED',updated_at:new Date().toISOString()});await privateWrite('credential.json',{...f.credential,credential:oldToken,credential_expires_at:new Date(Date.now()-600000).toISOString(),local_control_origin:f.origin});
 const run=command=>execute(binary,[command,'--state',state,'--installation-id',identity.installation_id,'--control-origin',f.origin],{env:{...process.env,SSL_CERT_FILE:path.join(directory,'ca.pem')},timeout:15000,maxBuffer:8192});
 await assert.rejects(run('renew-credential'));assert.ok(await lstat(path.join(state,'credential-refresh.json')));
 const receipt=(await f.pool.query('SELECT * FROM installer.credential_receipts WHERE device_id=$1',[f.credential.device_id])).rows;assert.equal(receipt.length,1);
 await run('renew-credential');const renewed=JSON.parse(await readFile(path.join(state,'credential.json'),'utf8'));await jwtVerify(renewed.credential,f.signer.publicKey);assert.equal(renewed.device_id,f.credential.device_id);assert.equal(JSON.parse(await readFile(path.join(state,'identity.json'),'utf8')).seed,identity.seed);
 await assert.rejects(lstat(path.join(state,'credential-refresh.json')),{code:'ENOENT'});assert.equal((await f.pool.query('SELECT count(*)::int n FROM installer.credential_receipts WHERE device_id=$1',[f.credential.device_id])).rows[0].n,1);
 await run('heartbeat');assert.ok((await f.pool.query('SELECT last_heartbeat_at FROM installer.installations WHERE id=$1',[identity.installation_id])).rows[0].last_heartbeat_at);
 dropRotation=true;await assert.rejects(run('rotate-device-key'));const rotation=JSON.parse(await readFile(path.join(state,'rotation.json'),'utf8'));
 // Exact crash boundary: local identity replaced, credential still old.
 await privateWrite('identity.json',{...identity,seed:rotation.new_seed});
 await run('renew-credential');const rotated=JSON.parse(await readFile(path.join(state,'credential.json'),'utf8'));assert.notEqual(rotated.public_key_thumbprint,renewed.public_key_thumbprint);assert.equal(rotated.device_id,renewed.device_id);await assert.rejects(lstat(path.join(state,'rotation.json')),{code:'ENOENT'});
 // A longer outage after a lost rotation response also recovers using only
 // the retained new key, without re-pairing or trusting the revoked old key.
 dropRotation=true;await assert.rejects(run('rotate-device-key'));const pending=JSON.parse(await readFile(path.join(state,'rotation.json'),'utf8'));pending.created_at=new Date(Date.now()-180000).toISOString();await privateWrite('rotation.json',pending);await f.pool.query("UPDATE installer.credential_receipts SET issued_at=now()-interval '3 minutes' WHERE device_id=$1 AND request_id=$2",[f.credential.device_id,pending.request_id]);
 await run('renew-credential');await run('heartbeat');
 const before=await readFile(path.join(state,'credential.json'));assert.equal((await f.call('POST','/installations/'+identity.installation_id+'/unpair',{},f.users[0])).status,200);await assert.rejects(run('renew-credential'));assert.deepEqual(await readFile(path.join(state,'credential.json')),before);
 const replacementState=path.join(directory,'replacement-state');
 const replacement=spawn(binary,['recover-device','--confirm-management-recovery','--state',replacementState,'--installation-id',identity.installation_id,'--control-origin',f.origin],{env:{...process.env,SSL_CERT_FILE:path.join(directory,'ca.pem')},stdio:['ignore','pipe','pipe']});
 const stopped=new Promise(resolve=>replacement.once('close',resolve));let terminal='';replacement.stderr.on('data',()=>{});
 const human=await new Promise((resolve,reject)=>{const deadline=setTimeout(()=>reject(new Error('Recovery CLI pairing checkpoint timeout')),15000);replacement.stdout.on('data',chunk=>{terminal+=chunk.toString();const match=terminal.match(/enter ([A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5})\. Confirm device fingerprint ([A-Za-z0-9_-]{43})/);if(match){clearTimeout(deadline);resolve({code:match[1],thumbprint:match[2]});}});stopped.then(()=>{clearTimeout(deadline);reject(new Error('Recovery CLI stopped before owner consent'));});});
 const lookup=await f.call('POST','/pairing-sessions/lookup',{user_code:human.code},f.users[0]);assert.equal(lookup.status,200);
 const approval={user_code:human.code,public_key_thumbprint:human.thumbprint,confirm:true},approve='/pairing-sessions/'+lookup.body.pairing_session_id+'/approve';
 assert.equal((await f.call('POST',approve,approval,f.users[1])).status,404);assert.equal((await f.call('POST',approve,approval,f.users[0])).status,200);assert.equal(await stopped,0);
 const replacementCredential=JSON.parse(await readFile(path.join(replacementState,'credential.json'),'utf8'));assert.notEqual(replacementCredential.device_id,f.credential.device_id);assert.notEqual(replacementCredential.public_key_thumbprint,rotated.public_key_thumbprint);
 const replacementJournal=JSON.parse(await readFile(path.join(replacementState,'journal.json'),'utf8'));assert.equal(replacementJournal.phase,'PAIRED');assert.equal(replacementJournal.sequence,3,'Management recovery never records a production preflight pass');assert.ok(await lstat(path.join(replacementState,'management-only.json')));
 assert.equal((await f.pool.query('SELECT count(*)::int n FROM installer.devices WHERE installation_id=$1 AND revoked_at IS NULL',[identity.installation_id])).rows[0].n,1);assert.deepEqual(await readFile(path.join(state,'credential.json')),before);
 for(const file of ['identity.json','credential.json','journal.json'])assert.equal((await lstat(path.join(state,file))).mode&0o077,0);
 assert.equal(JSON.parse(await readFile(path.join(state,'journal.json'),'utf8')).phase,'PAIRED');
 console.log('Actual Go CLI expired access renewal, lost response, dual-key rotation, crash/outage recovery, heartbeat and revocation PASS; fixture private files retained');
});
