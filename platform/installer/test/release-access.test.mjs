import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {once} from 'node:events';
import {loadReleaseAccess} from '../src/release-access.mjs';
import {createControlServer} from '../src/server.mjs';

test('release activation defaults closed and validates private pilot configuration',async()=>{
 const read=async()=> 'a'.repeat(64);
 assert.deepEqual(await loadReleaseAccess(undefined,read),{mode:'closed'});
 assert.deepEqual(await loadReleaseAccess({mode:'public'},read),{mode:'public'});
 for(const value of [{mode:'other'},{mode:'closed',pilotTokenFile:'/secret'},{mode:'pilot',extra:true},[]])await assert.rejects(loadReleaseAccess(value,read));
 await assert.rejects(loadReleaseAccess({mode:'pilot',pilotTokenFile:'/secret'},async()=> 'bad'));
 const pilot=await loadReleaseAccess({mode:'pilot',pilotTokenFile:'/secret'},read);
 assert.equal(pilot.tokenSHA256,createHash('sha256').update('a'.repeat(64)).digest('hex'));
 assert.equal(JSON.stringify(pilot).includes('a'.repeat(64)),false);
});
test('closed and pilot modes guard real HTTP before DB, dashboard, artifact and identity routes',async t=>{
 const key=generateKeyPairSync('ed25519');let queries=0,pages=0;
 const config={controlOrigin:'https://dashboard.buattokosendiri.web.id',signingKey:key.privateKey,verificationKey:key.publicKey};
 const pool={query:async()=>{queries++;return {rows:[]}}};
 const server=createControlServer(config,pool,{dashboard:async(_req,res)=>{pages++;res.end('synthetic dashboard');return true;}});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});
 const base='http://127.0.0.1:'+server.address().port;
 for(const path of ['/','/daftar','/bootstrap/downloads/'+'a'.repeat(43),'/api/installer/v1/installations','/auth/email/start','/auth/email/verify']){
  const result=await fetch(base+path,{method:'POST',body:'{}'});assert.equal(result.status,503);await result.body.cancel();
 }
 assert.equal(queries,0);assert.equal(pages,0);
 const status=await (await fetch(base+'/auth/status',{headers:{origin:'https://buattokosendiri.web.id'}})).json();
 assert.equal(status.configured,false);assert.equal(status.registration_url,null);
 assert.equal((await fetch(base+'/healthz')).status,200);assert.ok(queries>0);
 config.releaseAccess=await loadReleaseAccess({mode:'pilot',pilotTokenFile:'/synthetic'},async()=> 'a'.repeat(64));
 for(const value of ['', 'a'.repeat(63),'b'.repeat(64)])assert.equal((await fetch(base+'/',{headers:{'x-btos-pilot-token':value}})).status,503);
 assert.equal((await fetch(base+'/',{headers:{'x-btos-pilot-token':'a'.repeat(64)}})).status,200);
 // Admission is not identity: a valid proxy credential cannot create an auth session.
 assert.equal((await fetch(base+'/auth/email/start',{method:'POST',headers:{'x-btos-pilot-token':'a'.repeat(64),'content-type':'application/json',origin:config.controlOrigin},body:'{}'})).status,503);
 config.releaseAccess={mode:'closed'};assert.equal((await fetch(base+'/',{headers:{'x-btos-pilot-token':'a'.repeat(64)}})).status,503);
 config.releaseAccess={mode:'public'};assert.equal((await fetch(base+'/')).status,200);
});
