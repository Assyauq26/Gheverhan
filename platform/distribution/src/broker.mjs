import {randomUUID,randomBytes} from 'node:crypto';
import {fail,uuid,hash,validateRelease,secretBox} from './common.mjs';
import {transaction} from './db.mjs';
const aad=g=>[g.id,g.installation_id,g.device_id,g.project].join(':');
const audit=(c,g,action)=>c.query('INSERT INTO distribution.audit(id,installation_id,device_id,grant_id,action) VALUES($1,$2,$3,$4,$5)',[randomUUID(),g.installation_id,g.device_id,g.id,action]);
export function createBroker({pool,provider,encryptionKey,authorizeAgent,assertActive,resolveVerifiedRelease}){
 if(!pool||!provider||![authorizeAgent,assertActive,resolveVerifiedRelease].every(x=>typeof x==='function'))throw new Error('Trusted authentication, current-device and verified release resolvers required');
 const box=secretBox(encryptionKey);
 async function active(c,p){uuid(p.installation_id);uuid(p.device_id);if(!p.scopes?.includes('release:read')||await assertActive(c,p)!==true)fail('AGENT_REVOKED',403);}
 async function lock(c,id){await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,9148332))',[id]);}
 async function issue(request,rawBody){
  if(request.method!=='POST'||typeof rawBody!=='string'||Buffer.byteLength(rawBody)>4096)fail('INVALID_REQUEST',400);
  let input;try{input=JSON.parse(rawBody);}catch{fail('INVALID_REQUEST',400);}if(!input||Array.isArray(input)||Object.keys(input).sort().join(',')!=='release_id,request_id'||typeof input.release_id!=='string'||!/^[-a-zA-Z0-9.]{1,80}$/.test(input.release_id))fail('INVALID_REQUEST',400);uuid(input.request_id);
  let principal;
  let grant=await transaction(pool,async c=>{
   principal=await authorizeAgent(request,c,'release:read',{bodyHash:hash(rawBody)});await active(c,principal);await lock(c,principal.installation_id);
   const previous=(await c.query('SELECT * FROM distribution.grants WHERE installation_id=$1 AND device_id=$2 AND request_id=$3 FOR UPDATE',[principal.installation_id,principal.device_id,input.request_id])).rows[0];
   if(previous){if(previous.release_id!==input.release_id)fail('IDEMPOTENCY_CONFLICT',409);if(['revoking','revoked'].includes(previous.state)||previous.expires_at&&new Date(previous.expires_at)<=new Date())fail('GRANT_REVOKED',409);return previous;}
   const release=validateRelease(await resolveVerifiedRelease(c,principal,input.release_id),principal.installation_id);
   const count=(await c.query("SELECT count(*)::int AS n FROM distribution.grants WHERE installation_id=$1 AND created_at>now()-interval '1 hour'",[principal.installation_id])).rows[0].n;if(count>=6)fail('GRANT_RATE_LIMITED',429);
   const g={id:randomUUID(),installation_id:principal.installation_id,device_id:principal.device_id,...release};g.secret_cipher=box.seal('Aa1'+randomBytes(46).toString('base64url').slice(0,61),aad(g));
   const row=(await c.query("INSERT INTO distribution.grants(id,installation_id,device_id,request_id,release_id,project,repository,digest,version,metadata_expires_at,secret_cipher,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'provisioning') RETURNING *",[g.id,g.installation_id,g.device_id,input.request_id,input.release_id,g.project,g.repository,g.digest,g.version,g.metadataExpiresAt,g.secret_cipher])).rows[0];await audit(c,row,'requested');return row;
  });
  if(grant.state!=='active'){
   try {
   const secret=box.open(grant.secret_cipher,aad(grant));const remote=await provider.ensure({installationId:grant.installation_id,grantId:grant.id,secret});
   grant=await transaction(pool,async c=>{
    await lock(c,grant.installation_id);await active(c,principal);
    let current=(await c.query('SELECT * FROM distribution.grants WHERE id=$1 FOR UPDATE',[grant.id])).rows[0];if(current.state==='active')return current;if(current.state!=='provisioning')fail('GRANT_REVOKED',409);
    // New secret is withheld until all previous credentials for this device are
    // disabled at Harbor; already-minted JWTs remain valid until registry TTL.
    const old=(await c.query("SELECT * FROM distribution.grants WHERE installation_id=$1 AND device_id=$2 AND id<>$3 AND state IN ('active','revoking') FOR UPDATE",[current.installation_id,current.device_id,current.id])).rows;
    for(const row of old){if(await provider.disable({installationId:row.installation_id,grantId:row.id})!==true)fail('REGISTRY_REVOKE_PENDING');await c.query("UPDATE distribution.grants SET state='revoked',revoked_at=clock_timestamp() WHERE id=$1",[row.id]);await audit(c,row,'revoked');}
    current=(await c.query("UPDATE distribution.grants SET state='active',robot_id=$2,username=$3,expires_at=$4 WHERE id=$1 RETURNING *",[current.id,remote.robotId,remote.username,remote.expiresAt])).rows[0];await audit(c,current,'issued');return current;
   });
   } catch(error) {
    // A provider create may finish after local revocation/timeout. Keep cleanup
    // durable; account absence does not prove an in-flight creation was cancelled.
    await pool.query("UPDATE distribution.grants SET state='revoking' WHERE id=$1",[grant.id]);
    try {await transaction(pool,async c=>{await lock(c,grant.installation_id);const row=(await c.query('SELECT * FROM distribution.grants WHERE id=$1 FOR UPDATE',[grant.id])).rows[0];await revokeOne(c,row);});} catch {}
    throw error;
   }
  }
  return transaction(pool,async c=>{await lock(c,grant.installation_id);await active(c,principal);const g=(await c.query('SELECT * FROM distribution.grants WHERE id=$1 FOR UPDATE',[grant.id])).rows[0];const approved=validateRelease(await resolveVerifiedRelease(c,principal,input.release_id),principal.installation_id);if(['project','repository','digest','version'].some(k=>approved[k]!==g[k]))fail('RELEASE_IMMUTABILITY_CONFLICT',409);if(g.state!=='active'||new Date(g.expires_at)<=new Date()||new Date(g.metadata_expires_at)<=new Date())fail('GRANT_REVOKED',409);return {grant_id:g.id,registry:provider.origin,repository:g.project+'/'+g.repository,digest:g.digest,version:g.version,username:g.username,password:box.open(g.secret_cipher,aad(g)),expires_at:new Date(g.expires_at).toISOString(),revocation_model:'robot-disable plus configured registry JWT lifetime; no instant bearer-token invalidation claim'};});
 }
 async function revokeOne(c,g){if(await provider.disable({installationId:g.installation_id,grantId:g.id})!==true){await c.query("UPDATE distribution.grants SET state='revoking' WHERE id=$1",[g.id]);await audit(c,g,'revoke_pending');return false;}await c.query("UPDATE distribution.grants SET state='revoked',revoked_at=clock_timestamp() WHERE id=$1",[g.id]);await audit(c,g,'revoked');return true;}
 async function revokeInstallation(installationId){uuid(installationId);const rows=(await pool.query("SELECT id FROM distribution.grants WHERE installation_id=$1 AND state<>'revoked'",[installationId])).rows;let revoked=0,pending=0;
  for(const {id} of rows){try{await transaction(pool,async c=>{await lock(c,installationId);const g=(await c.query('SELECT * FROM distribution.grants WHERE id=$1 FOR UPDATE',[id])).rows[0];return g.state==='revoked'||await revokeOne(c,g);}).then(done=>{if(done)revoked++;else pending++;});}catch{pending++;await transaction(pool,async c=>{const g=(await c.query("UPDATE distribution.grants SET state='revoking' WHERE id=$1 RETURNING *",[id])).rows[0];await audit(c,g,'revoke_pending');});}}return {revoked,pending};
 }
 async function sweep(){const rows=(await pool.query("SELECT * FROM distribution.grants WHERE state<>'revoked' ORDER BY last_checked_at,created_at LIMIT 50")).rows;let revoked=0,pending=0;for(const g of rows){await pool.query('UPDATE distribution.grants SET last_checked_at=clock_timestamp() WHERE id=$1',[g.id]);let bound=false;try{bound=await assertActive(pool,{installation_id:g.installation_id,device_id:g.device_id,scopes:['release:read']})===true;}catch{bound=false;}if(g.state==='revoking'||!bound||g.expires_at&&new Date(g.expires_at)<=new Date()||g.state==='provisioning'&&new Date(g.created_at)<new Date(Date.now()-600000)){try{await transaction(pool,async c=>{await lock(c,g.installation_id);const current=(await c.query('SELECT * FROM distribution.grants WHERE id=$1 FOR UPDATE',[g.id])).rows[0];return current.state==='revoked'||await revokeOne(c,current);}).then(done=>{if(done)revoked++;else pending++;});}catch{pending++;await pool.query("UPDATE distribution.grants SET state='revoking' WHERE id=$1",[g.id]);}}}return {revoked,pending};}
 return {issue,revokeInstallation,sweep};
}
