import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateKeyPair,exportJWK,SignJWT,calculateJwkThumbprint } from 'jose';
import { createPool,migrate } from '../src/db.mjs';
import { createHandler } from '../src/api.mjs';
import { hash,opaque } from '../src/common.mjs';
import { managementTranscript } from '../src/lifecycle.mjs';
export async function fixture(t,{controlOrigin='https://lifecycle.fixture.example',domainLookup=async()=>false}={}){
 const connection=process.env.JETSELLER_CONTROL_TEST_DATABASE_URL;assert.equal(process.env.JETSELLER_CONTROL_TEST_CONFIRM,'isolated-control-fixture');const url=new URL(connection);assert.equal(url.pathname,'/js_control_fixture');assert.ok(['127.0.0.1','localhost'].includes(url.hostname));
 const pool=createPool(connection);t.after(()=>pool.end());await migrate(pool);
 const auth=await generateKeyPair('EdDSA',{crv:'Ed25519'}),signer=await generateKeyPair('EdDSA',{crv:'Ed25519'}),users=[];
 for(let n=0;n<2;n++){
  const seller=randomUUID(),subject='lifecycle-'+randomUUID(),sid=randomUUID(),csrf=opaque();await pool.query('INSERT INTO installer.sellers(id,external_subject,email_verified) VALUES($1,$2,true)',[seller,subject]);await pool.query("INSERT INTO installer.sessions(id,seller_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[sid,seller,hash(csrf)]);
  const token=await new SignJWT({sid,csrf,email_verified:true}).setProtectedHeader({alg:'EdDSA'}).setSubject(subject).setIssuer(controlOrigin).setAudience('fixture').setIssuedAt().setExpirationTime('1h').sign(auth.privateKey);users.push({seller,csrf,token});
 }
 const handler=createHandler({pool,controlOrigin,sessionIssuer:{issuer:controlOrigin,audience:'fixture',jwks:{keys:[await exportJWK(auth.publicKey)]}},signingKey:signer.privateKey,verificationKey:signer.publicKey,domainLookup});
 const ip='lifecycle-'+randomUUID();
 const call=async(method,path,data,user=null,headers={})=>{const request=new Request(controlOrigin+'/api/installer/v1'+path,{method,headers:{'content-type':'application/json',origin:controlOrigin,...(user?{cookie:'__Host-js_portal_session='+user.token,'x-csrf-token':user.csrf}:{}),...headers},...(data!==undefined?{body:JSON.stringify(data)}:{})});const res=await handler(request,{clientAddress:ip});return {status:res.status,body:await res.json()};};
 const input={display_name:'Synthetic lifecycle',domain:'lifecycle-'+randomUUID()+'.example',profile:'fresh_vps_ubuntu_amd64',requested_install_version:'stable'};
 const created=await call('POST','/installations',input,users[0],{'idempotency-key':randomUUID()});assert.equal(created.status,201);const installation=created.body.installation;
 const keys=await generateKeyPair('EdDSA',{crv:'Ed25519',extractable:true}),jwk=await exportJWK(keys.publicKey);
 const start=await call('POST','/agent/pairing/device',{installation_hint:installation.installation_id,public_key:jwk,protocol_version:'1',os:'ubuntu-24.04',arch:'amd64',agent_version:'0.1.0'});assert.equal(start.status,201);const session=start.body;
 assert.equal((await call('POST','/pairing-sessions/'+session.pairing_session_id+'/approve',{user_code:session.user_code,public_key_thumbprint:await calculateJwkThumbprint(jwk),confirm:true},users[0])).status,200);
 const pairingProof=await new SignJWT({nonce:session.nonce,operation:'pairing-token',code_hash:hash(session.device_code)}).setProtectedHeader({alg:'EdDSA',typ:'jetseller-pairing+jwt'}).setAudience(controlOrigin).setIssuedAt().setExpirationTime('60s').setJti(randomUUID()).sign(keys.privateKey);
 const delivered=await call('POST','/agent/pairing/token',{device_code:session.device_code,proof:pairingProof});assert.equal(delivered.status,200);const credential=delivered.body;
 async function management(operation,{key=keys.privateKey,newKey=null,requestId=randomUUID(),patch={}}={}){
  const input={installation_id:installation.installation_id,device_id:credential.device_id,request_id:requestId,...(newKey?{new_public_key:await exportJWK(newKey.publicKey)}:{})};
  const path='/agent/credentials/'+operation,digest=hash(managementTranscript(input,operation==='rotate'));
  const sign=(k,op)=>new SignJWT({nonce:credential.management_nonce,operation:op,request_hash:digest,htm:'POST',htu:controlOrigin+'/api/installer/v1'+path,...patch}).setProtectedHeader({alg:'EdDSA',typ:'jetseller-management+jwt'}).setAudience(controlOrigin).setIssuedAt().setExpirationTime('60s').setJti(randomUUID()).sign(k);
  return {...input,proof:await sign(key,operation==='rotate'?'key-rotation-old':'credential-refresh'),...(newKey?{new_key_proof:await sign(newKey.privateKey,'key-rotation-new')}:{})};
 }
 async function access(path,token=credential,key=keys.privateKey,body){
  const method=body===undefined?'GET':'POST';const proof=await new SignJWT({htm:method,htu:controlOrigin+'/api/installer/v1'+path,ath:Buffer.from(hash(token.credential),'hex').toString('base64url'),nonce:token.management_nonce,...(body?{bht:hash(JSON.stringify(body))}:{})}).setProtectedHeader({alg:'EdDSA',typ:'dpop+jwt'}).setIssuedAt().setJti(randomUUID()).sign(key);
  return {authorization:'DPoP '+token.credential,dpop:proof};
 }
 return {pool,call,keys,jwk,users,signer,credential,installation,management,access,handler,origin:controlOrigin};
}
