import { randomUUID, randomBytes } from 'node:crypto';
import { ApiError, fail, hash, opaque, uuid, exact, text, domain, origin, scopes, installationInput, publicInstallation } from './common.mjs';
import { transaction, rate } from './db.mjs';
import { sellerAuthenticator, requireCsrf, deviceKey, pairingProof, credential, agentIdentity } from './auth.mjs';

import { domainProofRoute } from './domain-proof.mjs';
import { reserveDomain } from './domain-reservation.mjs';

const prefix = '/api/installer/v1';
const normalizedCode = value => {
  text(value,10,11);
  const code = value.replace('-','').toUpperCase();
  if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/.test(code)) fail(400,'INVALID_REQUEST');
  return code;
};
const code = () => [...randomBytes(10)].map(b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b & 31]).join('');
async function body(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) fail(415,'JSON_REQUIRED');
  const chunks=[];let bytes=0;
  if(request.body){const reader=request.body.getReader();try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>16384)fail(413,'BODY_TOO_LARGE');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}}
  const raw=Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw); } catch { fail(400,'INVALID_REQUEST'); }
}
function json(status, value, headers={}) {
  return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(status===429?{'Retry-After':'5'}:{}),...headers}});
}
async function own(client, id, seller, lock = false) {
  const result = await client.query(`SELECT i.*,d.id AS device_id FROM installer.installations i LEFT JOIN installer.devices d ON d.installation_id=i.id AND d.revoked_at IS NULL WHERE i.id=$1 AND i.seller_id=$2${lock?' FOR UPDATE OF i':''}`,[id,seller]);
  if (!result.rows[0]) fail(404,'NOT_FOUND');
  return result.rows[0];
}
function pairingPublic(pairing) {
  return { pairing_session_id:pairing.id,installation_id:pairing.installation_id,display_name:pairing.display_name,
    domain:pairing.domain,public_key_thumbprint:pairing.thumbprint,status:pairing.status,
    expires_at:pairing.expires_at,scopes,agent_version:pairing.agent_version,os:pairing.os,arch:pairing.arch };
}

export function createHandler({pool,controlOrigin,sessionIssuer,signingKey,verificationKey,domainLookup,installRelease}) {
  origin(controlOrigin);
  if (!signingKey) throw new Error('Agent signing key required');
  const authenticate = sellerAuthenticator(pool,sessionIssuer);
  return async function handle(request,{clientAddress='unknown'}={}) {
    try {
      const url = new URL(request.url);
      if (url.origin !== controlOrigin || url.search || url.hash) fail(400,'INVALID_REQUEST');
      const path = url.pathname;
      if (!path.startsWith(prefix+'/')) fail(404,'NOT_FOUND');
      if (request.headers.get('content-length') && Number(request.headers.get('content-length'))>16384) fail(413,'BODY_TOO_LARGE');
      await rate(pool,'ip:'+clientAddress,120);
      // The independent release module performs its own seller/device auth and
      // scope checks. Only these fixed paths may cross the extension boundary.
      if(installRelease&&((path===prefix+'/agent/install-authorization'&&request.method==='GET')||
        (path===prefix+'/agent/install-progress'&&request.method==='POST')||
        (/^\/api\/installer\/v1\/installations\/[^/]+\/(?:install-instructions|install-progress)$/.test(path)&&request.method==='GET'))) {
        const releaseResponse=await installRelease(request,{clientAddress});
        if(releaseResponse)return releaseResponse;
      }
      if(path===prefix+'/agent/identity' && request.method==='GET') {
        return json(200,await transaction(pool,c=>agentIdentity(request,c,verificationKey,controlOrigin)));
      }
      if (path===prefix+'/agent/credential/renew' && request.method==='POST') {
        await rate(pool,'agent-renew-ip:'+clientAddress,30,600);
        const result = await transaction(pool,async client=>{
          // This is an explicitly *proactive* renewal. The old credential must
          // still be valid, device-bound, and carry a fresh single-use DPoP
          // proof for this POST URL; no seller session or static refresh token.
          const identity = await agentIdentity(request,client,verificationKey,controlOrigin);
          exact(await body(request),[]);
          const device=(await client.query(
            'SELECT installation_id,thumbprint,nonce FROM installer.devices WHERE id=$1 AND installation_id=$2 AND revoked_at IS NULL FOR UPDATE',
            [identity.device_id,identity.installation_id]
          )).rows[0];
          if (!device) fail(401,'AGENT_AUTH_REQUIRED');
          return credential(signingKey,controlOrigin,device,identity.device_id,identity.scopes);
        });
        return json(200,result);
      }
      if (path === prefix+'/agent/pairing/device' && request.method==='POST') {
        await rate(pool,'device-ip:'+clientAddress,10);
        const b=exact(await body(request),['installation_hint','public_key','protocol_version','os','arch','agent_version']);
        const install=uuid(b.installation_hint);
        if (b.protocol_version!=='1'||b.os!=='ubuntu-24.04'||b.arch!=='amd64') fail(400,'UNSUPPORTED_PROFILE');
        text(b.agent_version,1,32);
        const identity=await deviceKey(b.public_key);
        await rate(pool,'device-install:'+install,5,600);
        const sessionId=randomUUID(),deviceCode=opaque(),userCode=code(),nonce=opaque();
        const result=await transaction(pool,async c=>{
          const record=(await c.query("SELECT id FROM installer.installations WHERE id=$1 AND status IN ('DRAFT','UNPAIRED') AND claim_expires_at>now() FOR UPDATE",[install])).rows[0];
          if (!record) fail(404,'NOT_FOUND');
          return (await c.query(`INSERT INTO installer.pairing_sessions(id,installation_id,device_hash,user_hash,public_jwk,thumbprint,nonce,agent_version,os,arch,expires_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()+interval '10 minutes') RETURNING expires_at`,
            [sessionId,install,hash(deviceCode),hash(userCode),b.public_key,identity.thumbprint,nonce,b.agent_version,b.os,b.arch])).rows[0];
        });
        return json(201,{pairing_session_id:sessionId,device_code:deviceCode,user_code:userCode.slice(0,5)+'-'+userCode.slice(5),nonce,
          expires_in:600,interval:5,expires_at:result.expires_at,verification_uri:controlOrigin+'/hubungkan-server'});
      }
      if (path===prefix+'/agent/pairing/token' && request.method==='POST') {
        const b=exact(await body(request),['device_code','proof']); text(b.device_code,43,43);
        // Unknown device codes never disclose installation or seller identity.
        const found=(await pool.query('SELECT * FROM installer.pairing_sessions WHERE device_hash=$1',[hash(b.device_code)])).rows[0];
        if(!found) fail(401,'INVALID_DEVICE_PROOF');
        if(new Date(found.expires_at)<=new Date()) fail(410,'PAIR_EXPIRED');
        const proof=await pairingProof(b.proof,found,controlOrigin);
        const outcome=await transaction(pool,async c=>{
          const pairing=(await c.query('SELECT * FROM installer.pairing_sessions WHERE id=$1 FOR UPDATE',[found.id])).rows[0];
          if(new Date(pairing.expires_at)<=new Date()) return {error:410,code:'PAIR_EXPIRED'};
          await c.query('DELETE FROM installer.proof_replays WHERE expires_at<now()');
          const inserted=await c.query('INSERT INTO installer.proof_replays(thumbprint,jti_hash,expires_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING jti_hash',[pairing.thumbprint,proof.jti_hash,proof.expires_at]);
          if(!inserted.rowCount) return {error:409,code:'PROOF_REPLAY'};
          if(pairing.status==='CANCELLED') return {error:403,code:'PAIR_DENIED'};
          // Bounded same-key retry allows recovery from a lost issuance response.
          if(pairing.status==='CONSUMED') {
            const active=(await c.query('SELECT id FROM installer.devices WHERE id=$1 AND revoked_at IS NULL AND $2::timestamptz>now()-interval \'2 minutes\'',[pairing.device_id,pairing.credential_issued_at])).rows[0];
            if(!active) return {error:409,code:'PAIR_ALREADY_USED'};
            return {pairing,device:active.id};
          }
          if(pairing.last_poll_at && Date.now()-new Date(pairing.last_poll_at).getTime()<5000) return {error:429,code:'SLOW_DOWN'};
          await c.query('UPDATE installer.pairing_sessions SET last_poll_at=now() WHERE id=$1',[pairing.id]);
          if(pairing.status==='PENDING') return {pending:true};
          const installation=(await c.query('SELECT * FROM installer.installations WHERE id=$1 FOR UPDATE',[pairing.installation_id])).rows[0];
          if(installation.status!=='PAIRED') return {error:409,code:'PAIR_DENIED'};
          const active=(await c.query('SELECT id FROM installer.devices WHERE installation_id=$1 AND revoked_at IS NULL',[pairing.installation_id])).rows[0];
          if(!active || active.id!==pairing.device_id) return {error:403,code:'PAIR_DENIED'};
          await c.query("UPDATE installer.pairing_sessions SET status='CONSUMED',credential_issued_at=now() WHERE id=$1",[pairing.id]);
          return {pairing,device:active.id};
        });
        if(outcome.error) fail(outcome.error,outcome.code);
        if(outcome.pending) return json(202,{status:'authorization_pending'});
        return json(200,await credential(signingKey,controlOrigin,outcome.pairing,outcome.device));
      }
      const seller=await authenticate(request);
      if(request.method!=='GET') requireCsrf(request,seller,controlOrigin);
      await rate(pool,'seller:'+seller.seller_id,60);
      if(path===prefix+'/session' && request.method==='GET') return json(200,{authenticated:true,seller_id:seller.seller_id,csrf_token:seller.csrf_token});
      if(path===prefix+'/session/logout' && request.method==='POST') {
        exact(await body(request),[]);
        await pool.query('UPDATE installer.sessions SET revoked_at=now() WHERE id=$1',[seller.session_id]);
        return json(200,{status:'SIGNED_OUT',scope:'local_portal_session'},{'Set-Cookie':'__Host-js_portal_session=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax'});
      }
      const proof=await domainProofRoute({request,path,pool,seller,own,readBody:body,lookup:domainLookup});
      if(proof)return json(proof.status,proof.body);
      if(path===prefix+'/installations' && request.method==='GET') {
        const result=await pool.query(`SELECT i.*,d.id AS device_id FROM installer.installations i LEFT JOIN installer.devices d ON d.installation_id=i.id AND d.revoked_at IS NULL WHERE seller_id=$1 ORDER BY i.created_at DESC LIMIT 100`,[seller.seller_id]);
        return json(200,{installations:result.rows.map(publicInstallation)});
      }
      if(path===prefix+'/installations' && request.method==='POST') {
        const input=installationInput(await body(request)),requestId=uuid(request.headers.get('idempotency-key'));
        const digest=hash(JSON.stringify(input));
        const installation=await transaction(pool,async c=>{
          await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['seller-create:'+seller.seller_id]);
          const existing=(await c.query('SELECT * FROM installer.installations WHERE seller_id=$1 AND client_request_id=$2',[seller.seller_id,requestId])).rows[0];
          if(existing){if(existing.request_hash!==digest)fail(409,'IDEMPOTENCY_CONFLICT');return existing;}
          const count=(await c.query("SELECT count(*)::int AS n FROM installer.installations WHERE seller_id=$1 AND status<>'CANCELLED'",[seller.seller_id])).rows[0].n;
          if(count>=20) fail(409,'INSTALLATION_LIMIT');
          await reserveDomain(c,input.domain);
          return (await c.query(`INSERT INTO installer.installations(id,seller_id,display_name,domain,reserved_domain,claim_expires_at,client_request_id,request_hash)
            VALUES($1,$2,$3,$4,$4,now()+interval '24 hours',$5,$6) RETURNING *`,[randomUUID(),seller.seller_id,input.display_name,input.domain,requestId,digest])).rows[0];
        });
        return json(201,{installation:publicInstallation(installation)});
      }
      const installationMatch=path.match(/^\/api\/installer\/v1\/installations\/([^/]+)$/);
      if(installationMatch) {
        const id=uuid(installationMatch[1]);
        if(request.method==='GET') return json(200,{installation:publicInstallation(await own(pool,id,seller.seller_id))});
        if(['PATCH','DELETE'].includes(request.method)) {
          const version=Number(request.headers.get('if-match'));
          if(!Number.isSafeInteger(version)||version<1) fail(428,'VERSION_REQUIRED');
          const input=request.method==='PATCH'?exact(await body(request),['display_name','domain']):null;
          const installation=await transaction(pool,async c=>{
            const record=await own(c,id,seller.seller_id,true);
            if(record.version!==version) fail(409,'VERSION_CONFLICT');
            if(!['DRAFT','UNPAIRED'].includes(record.status)) fail(409,'INSTALLATION_LOCKED');
            if(!input) {
              await c.query("UPDATE installer.pairing_sessions SET status='CANCELLED' WHERE installation_id=$1 AND status='PENDING'",[id]);
              return (await c.query("UPDATE installer.installations SET status='CANCELLED',reserved_domain=NULL,version=version+1,updated_at=now() WHERE id=$1 RETURNING *",[id])).rows[0];
            }
            const name=text(input.display_name,1,100),host=domain(input.domain);
            const pending=(await c.query("SELECT id FROM installer.pairing_sessions WHERE installation_id=$1 AND status='PENDING' AND expires_at>now() LIMIT 1",[id])).rows[0];
            if(pending) fail(409,'PAIR_PENDING');
            await reserveDomain(c,host);
            return (await c.query("UPDATE installer.installations SET display_name=$2,domain=$3,reserved_domain=$3,claim_expires_at=now()+interval '24 hours',version=version+1,updated_at=now() WHERE id=$1 RETURNING *",[id,name,host])).rows[0];
          });
          return json(200,{installation:publicInstallation(installation)});
        }
      }
      if(path===prefix+'/pairing-sessions/lookup' && request.method==='POST') {
        await rate(pool,'lookup:'+seller.seller_id,10);
        const b=exact(await body(request),['user_code']);
        const found=(await pool.query(`SELECT p.*,i.display_name,i.domain FROM installer.pairing_sessions p JOIN installer.installations i ON i.id=p.installation_id
          WHERE p.user_hash=$1 AND i.seller_id=$2 AND p.status='PENDING' AND p.expires_at>now()`,[hash(normalizedCode(b.user_code)),seller.seller_id])).rows[0];
        if(!found) fail(404,'NOT_FOUND');
        return json(200,pairingPublic(found));
      }
      const pairingMatch=path.match(/^\/api\/installer\/v1\/pairing-sessions\/([^/]+)\/(approve|cancel)$/);
      if(pairingMatch && request.method==='POST') {
        const id=uuid(pairingMatch[1]),approve=pairingMatch[2]==='approve';
        const b=exact(await body(request),approve?['user_code','public_key_thumbprint','confirm']:[]);
        if(approve && b.confirm!==true) fail(400,'CONFIRMATION_REQUIRED');
        const result=await transaction(pool,async c=>{
          const pairing=(await c.query(`SELECT p.* FROM installer.pairing_sessions p JOIN installer.installations i ON i.id=p.installation_id
            WHERE p.id=$1 AND i.seller_id=$2 FOR UPDATE OF p`,[id,seller.seller_id])).rows[0];
          if(!pairing) fail(404,'NOT_FOUND');
          if(pairing.status!=='PENDING') fail(409,'PAIR_ALREADY_USED');
          if(new Date(pairing.expires_at)<=new Date()) fail(410,'PAIR_EXPIRED');
          if(!approve) {await c.query("UPDATE installer.pairing_sessions SET status='CANCELLED' WHERE id=$1",[id]);return {status:'CANCELLED'};}
          if(hash(normalizedCode(b.user_code))!==pairing.user_hash || b.public_key_thumbprint!==pairing.thumbprint) fail(403,'PAIR_CONFIRMATION_MISMATCH');
          const installation=await own(c,pairing.installation_id,seller.seller_id,true);
          if(!['DRAFT','UNPAIRED'].includes(installation.status)||new Date(installation.claim_expires_at)<=new Date()) fail(409,'DEVICE_ALREADY_BOUND');
          await reserveDomain(c,installation.domain);
          const device=randomUUID();
          await c.query('INSERT INTO installer.devices(id,installation_id,public_jwk,thumbprint,nonce) VALUES($1,$2,$3,$4,$5)',[device,installation.id,pairing.public_jwk,pairing.thumbprint,pairing.nonce]);
          await c.query("UPDATE installer.installations SET status='PAIRED',reserved_domain=domain,version=version+1,updated_at=now() WHERE id=$1",[installation.id]);
          await c.query("UPDATE installer.pairing_sessions SET status='APPROVED',device_id=$2 WHERE id=$1",[id,device]);
          return {installation_id:installation.id,device_id:device,status:'PAIRED'};
        });
        return json(200,result);
      }
      const unpairMatch=path.match(/^\/api\/installer\/v1\/installations\/([^/]+)\/unpair$/);
      if(unpairMatch && request.method==='POST') {
        exact(await body(request),[]);
        const result=await transaction(pool,async c=>{
          const record=await own(c,uuid(unpairMatch[1]),seller.seller_id,true);
          if(record.status==='UNPAIRED')return record;
          if(record.status!=='PAIRED')fail(409,'INSTALLATION_LOCKED');
          await c.query('UPDATE installer.devices SET revoked_at=now() WHERE installation_id=$1 AND revoked_at IS NULL',[record.id]);
          await c.query("UPDATE installer.pairing_sessions SET status='CANCELLED' WHERE installation_id=$1",[record.id]);
          return (await c.query("UPDATE installer.installations SET status='UNPAIRED',claim_expires_at=now()+interval '24 hours',version=version+1,updated_at=now() WHERE id=$1 RETURNING *",[record.id])).rows[0];
        });
        return json(200,{installation:publicInstallation(result)});
      }
      fail(404,'NOT_FOUND');
    } catch(error) {
      // No SQL, tokens, private paths, request bodies or exception messages leave this boundary.
      return json(error instanceof ApiError?error.status:503,{error:{code:error instanceof ApiError?error.code:'CONTROL_UNAVAILABLE'}});
    }
  };
}
