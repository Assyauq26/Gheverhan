import { randomUUID } from 'node:crypto';
import { jwtVerify } from 'jose';
import { fail, exact, uuid, hash, text } from './common.mjs';
import { deviceKey, credential, agentIdentity } from './auth.mjs';
import { transaction, rate } from './db.mjs';

// A versioned application JOSE transcript, not an OAuth/DPoP compliance claim.
export function managementTranscript(value, rotation=false) {
  const result={installation_id:uuid(value.installation_id),device_id:uuid(value.device_id),request_id:uuid(value.request_id)};
  if(rotation) result.new_public_key=value.new_public_key;
  return JSON.stringify(result);
}
async function proof(value, device, request, operation, requestHash, controlOrigin) {
  const {key}=await deviceKey(device.public_jwk);
  let p;
  try { ({payload:p}=await jwtVerify(text(value,30,4096),key,{algorithms:['EdDSA'],typ:'jetseller-management+jwt',audience:controlOrigin,requiredClaims:['iat','exp','jti','nonce','operation','request_hash','htm','htu'],clockTolerance:5,maxTokenAge:'60s'})); }
  catch {fail(401,'INVALID_DEVICE_PROOF');}
  if(!Number.isSafeInteger(p.iat)||!Number.isSafeInteger(p.exp)||p.exp-p.iat>60||p.exp<=p.iat||p.iat>Math.floor(Date.now()/1000)+5||p.nonce!==device.nonce||p.operation!==operation||p.request_hash!==requestHash||p.htm!==request.method||p.htu!==request.url)fail(401,'INVALID_DEVICE_PROOF');
  uuid(p.jti);return {thumbprint:device.thumbprint,jti_hash:hash(p.jti),expires_at:new Date((p.exp+5)*1000)};
}
async function remember(client, p) {
  await client.query('DELETE FROM installer.proof_replays WHERE expires_at<now()');
  const inserted=await client.query('INSERT INTO installer.proof_replays(thumbprint,jti_hash,expires_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING jti_hash',[p.thumbprint,p.jti_hash,p.expires_at]);
  if(!inserted.rowCount)fail(409,'PROOF_REPLAY');
}
async function active(client, installation, device) {
  const install=(await client.query("SELECT * FROM installer.installations WHERE id=$1 AND status='PAIRED' FOR UPDATE",[installation])).rows[0];
  if(!install)fail(401,'DEVICE_REVOKED');
  const row=(await client.query('SELECT * FROM installer.devices WHERE id=$1 AND installation_id=$2 AND revoked_at IS NULL AND activated_at IS NOT NULL FOR UPDATE',[device,installation])).rows[0];
  if(!row)fail(401,'DEVICE_REVOKED');return row;
}
export async function auditAgent(client,installation,device,actor,operation,requestId=null) {
  await client.query('INSERT INTO installer.agent_audit(installation_id,device_id,actor,operation,request_id) VALUES($1,$2,$3,$4,$5)',[installation,device,actor,operation,requestId]);
}
export async function credentialOperation({request,path,pool,signingKey,controlOrigin,readBody}) {
  const rotate=path.endsWith('/rotate');
  const input=exact(await readBody(request),rotate?['installation_id','device_id','request_id','new_public_key','proof','new_key_proof']:['installation_id','device_id','request_id','proof']);
  const transcript=managementTranscript(input,rotate),digest=hash(transcript);
  const freshKey=rotate?await deviceKey(input.new_public_key):null;
  await rate(pool,'management:'+input.device_id,20);
  const outcome=await transaction(pool,async client=>{
    let device=await active(client,input.installation_id,input.device_id);
    // Operation records retain one day; the retry response window is only 2min.
    await client.query("DELETE FROM installer.credential_receipts WHERE device_id=$1 AND issued_at<now()-interval '1 day'",[device.id]);
    const receipt=(await client.query('SELECT * FROM installer.credential_receipts WHERE device_id=$1 AND request_id=$2',[device.id,input.request_id])).rows[0];
    const operation=rotate?'ROTATE':'REFRESH';
    if(receipt&&(receipt.operation!==operation||receipt.request_hash!==digest))fail(409,'IDEMPOTENCY_CONFLICT');
    if(receipt&&(new Date(receipt.issued_at).getTime()<Date.now()-120000||receipt.key_epoch!==device.key_epoch))fail(409,'OPERATION_EXPIRED');
    const previous=rotate&&receipt?{public_jwk:receipt.previous_jwk,nonce:receipt.previous_nonce,thumbprint:(await deviceKey(receipt.previous_jwk)).thumbprint}:device;
    const authorization=await proof(input.proof,previous,request,rotate?'key-rotation-old':'credential-refresh',digest,controlOrigin);
    const second=rotate?await proof(input.new_key_proof,{public_jwk:input.new_public_key,nonce:previous.nonce,thumbprint:freshKey.thumbprint},request,'key-rotation-new',digest,controlOrigin):null;
    await remember(client,authorization);if(second)await remember(client,second);
    if(receipt)return {device,receipt};
    let prior=null,priorNonce=null;
    if(rotate){
      if(freshKey.thumbprint===device.thumbprint)fail(409,'KEY_UNCHANGED');
      prior=device.public_jwk;priorNonce=device.nonce;
      device=(await client.query('UPDATE installer.devices SET public_jwk=$2,thumbprint=$3,key_epoch=key_epoch+1 WHERE id=$1 RETURNING *',[device.id,input.new_public_key,freshKey.thumbprint])).rows[0];
    }
    const issued=new Date(Math.floor(Date.now()/1000)*1000),expires=new Date(issued.getTime()+600000);
    const saved=(await client.query('INSERT INTO installer.credential_receipts(device_id,request_id,request_hash,operation,issued_at,expires_at,token_jti,key_epoch,previous_jwk,previous_nonce) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[device.id,input.request_id,digest,operation,issued,expires,randomUUID(),device.key_epoch,prior,priorNonce])).rows[0];
    await auditAgent(client,device.installation_id,device.id,'DEVICE',rotate?'DEVICE_KEY_ROTATED':'CREDENTIAL_REFRESHED',input.request_id);
    return {device,receipt:saved};
  });
  return credential(signingKey,controlOrigin,{installation_id:outcome.device.installation_id,thumbprint:outcome.device.thumbprint,nonce:outcome.device.nonce,key_epoch:outcome.device.key_epoch},outcome.device.id,outcome.receipt);
}
export async function heartbeat({request,pool,verificationKey,controlOrigin,readBody}) {
  const input=exact(await readBody(request),['agent_version','app_version','app_image_digest','readiness','update_state']);
  text(input.agent_version,1,32);
  if(input.app_version!==null&&!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?$/.test(text(input.app_version,1,64)))fail(400,'INVALID_REQUEST');
  if(input.app_image_digest!==null&&!/^sha256:[a-f0-9]{64}$/.test(input.app_image_digest))fail(400,'INVALID_REQUEST');
  if(!['unknown','ready','not_ready'].includes(input.readiness)||!['IDLE','CHECKING','AWAITING_APPROVAL','UPDATING','FAILED','RECOVERY_REQUIRED'].includes(input.update_state))fail(400,'INVALID_REQUEST');
  const digest=hash(JSON.stringify({agent_version:input.agent_version,app_version:input.app_version,app_image_digest:input.app_image_digest,readiness:input.readiness,update_state:input.update_state}));
  return transaction(pool,async client=>{
    const identity=await agentIdentity(request,client,verificationKey,controlOrigin,'report:heartbeat',{bodyHash:digest});
    await client.query('UPDATE installer.installations SET observed_app_version=$2,observed_image_digest=$3,last_heartbeat_at=clock_timestamp(),observed_readiness=$4,observed_update_state=$5 WHERE id=$1',[identity.installation_id,input.app_version,input.app_image_digest,input.readiness,input.update_state]);
    // Agent telemetry is an observation; no INSTALLED promotion or seller data.
    return {installation_id:identity.installation_id,device_id:identity.device_id,status:'OBSERVATION_ACCEPTED',desired_release:null};
  });
}
