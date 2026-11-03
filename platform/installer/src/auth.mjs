import { createLocalJWKSet, jwtVerify, importJWK, calculateJwkThumbprint, SignJWT } from 'jose';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { fail, hash, text, uuid, scopes, origin } from './common.mjs';

/** Auth service must provision verified sellers and revocable sessions separately.
 * No caller-controlled identity header or storefront cookie is accepted. */
export function sellerAuthenticator(pool, config) {
  if (!config) return async () => fail(503,'AUTH_UNAVAILABLE');
  origin(config.issuer);
  if (!config.audience || !config.jwks?.keys?.length || config.jwks.keys.some(key => key.d || key.k || key.kty !== 'OKP' || key.crv !== 'Ed25519')) throw new Error('Invalid seller issuer configuration');
  const keys = createLocalJWKSet(config.jwks);
  return async request => {
    const cookies = request.headers.get('cookie') ?? '';
    const matches = cookies.split(';').map(x => x.trim()).filter(x => x.startsWith('__Host-js_portal_session='));
    if (matches.length !== 1) fail(401,'AUTH_REQUIRED');
    const token = matches[0].slice('__Host-js_portal_session='.length);
    let payload;
    try { ({ payload } = await jwtVerify(token, keys, { algorithms:['EdDSA'],issuer:config.issuer,audience:config.audience,requiredClaims:['sub','sid','email_verified','csrf','iat','exp'],maxTokenAge:'1h' })); }
    catch { fail(401,'AUTH_REQUIRED'); }
    if (payload.email_verified !== true) fail(403,'ACCOUNT_NOT_VERIFIED');
    uuid(payload.sid); text(payload.csrf,32,128); text(payload.sub,1,200);
    const result = await pool.query(`SELECT s.id,s.seller_id,s.csrf_hash FROM installer.sessions s JOIN installer.sellers a ON a.id=s.seller_id
      WHERE s.id=$1 AND a.external_subject=$2 AND a.email_verified=true AND s.expires_at>now() AND s.revoked_at IS NULL`,[payload.sid,payload.sub]);
    const session = result.rows[0];
    if (!session || session.csrf_hash !== hash(payload.csrf)) fail(401,'AUTH_REQUIRED');
    return { seller_id:session.seller_id,session_id:session.id,csrf_token:payload.csrf };
  };
}
export function requireCsrf(request, session, controlOrigin) {
  const provided = request.headers.get('x-csrf-token') ?? '';
  if (request.headers.get('origin') !== controlOrigin || Buffer.byteLength(provided) !== Buffer.byteLength(session.csrf_token) || !timingSafeEqual(Buffer.from(provided),Buffer.from(session.csrf_token))) fail(403,'CSRF_REJECTED');
}
export async function deviceKey(jwk) {
  if (!jwk || typeof jwk !== 'object' || Array.isArray(jwk) || Object.keys(jwk).some(key => !['kty','crv','x'].includes(key)) || jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !/^[A-Za-z0-9_-]{43}$/.test(jwk.x)) fail(400,'INVALID_DEVICE_KEY');
  try { return { key:await importJWK(jwk,'EdDSA'),thumbprint:await calculateJwkThumbprint(jwk,'sha256') }; }
  catch { fail(400,'INVALID_DEVICE_KEY'); }
}
/** A restricted JOSE proof profile, not a claim of OAuth/RFC9449 compliance. */
export async function pairingProof(proof, pairing, controlOrigin) {
  text(proof,30,4096);
  const { key } = await deviceKey(pairing.public_jwk);
  let result;
  try { result = await jwtVerify(proof,key,{ algorithms:['EdDSA'], audience:controlOrigin,typ:'jetseller-pairing+jwt',requiredClaims:['iat','exp','jti','nonce','operation','code_hash'],clockTolerance:5,maxTokenAge:'60s' }); }
  catch { fail(401,'INVALID_DEVICE_PROOF'); }
  const p = result.payload;
  if (p.exp-p.iat > 60 || p.iat > Math.floor(Date.now()/1000)+5 || p.nonce !== pairing.nonce || p.operation !== 'pairing-token' || p.code_hash !== pairing.device_hash) fail(401,'INVALID_DEVICE_PROOF');
  uuid(p.jti);
  return { jti_hash:hash(p.jti), expires_at:new Date((p.exp+5)*1000) };
}
export async function credential(signingKey, issuer, pairing, deviceId, issuance = {}) {
  const issuedAt = issuance.issued_at ? Math.floor(new Date(issuance.issued_at).getTime()/1000) : Math.floor(Date.now()/1000);
  const expires = issuance.expires_at ? new Date(issuance.expires_at) : new Date((issuedAt+600)*1000);
  const token = await new SignJWT({ installation_id:pairing.installation_id,scopes,key_epoch:pairing.key_epoch??1,cnf:{jkt:pairing.thumbprint} })
    .setProtectedHeader({alg:'EdDSA',typ:'jetseller-agent+jwt'}).setSubject(deviceId).setIssuer(issuer).setAudience('jetseller-agent-management')
    .setJti(issuance.token_jti??randomUUID()).setIssuedAt(issuedAt).setExpirationTime(Math.floor(expires.getTime()/1000)).sign(signingKey);
  return { installation_id:pairing.installation_id,device_id:deviceId,credential_expires_at:expires.toISOString(),scopes,
    credential:token,token_type:'jetseller-pop',public_key_thumbprint:pairing.thumbprint,management_nonce:pairing.nonce };
}

export async function agentIdentity(request, client, verificationKey, controlOrigin, requiredScope='report:heartbeat', {bodyHash}={}) {
  if(!verificationKey) fail(503,'AGENT_AUTH_UNAVAILABLE');
  const authorization=request.headers.get('authorization')??'';
  if(!authorization.startsWith('DPoP ')) fail(401,'AGENT_AUTH_REQUIRED');
  const token=text(authorization.slice(5),30,4096);
  let payload;
  try { ({payload}=await jwtVerify(token,verificationKey,{algorithms:['EdDSA'],issuer:controlOrigin,audience:'jetseller-agent-management',typ:'jetseller-agent+jwt',requiredClaims:['sub','installation_id','cnf','scopes','iat','exp','jti'],maxTokenAge:'10m'})); }
  catch { fail(401,'AGENT_AUTH_REQUIRED'); }
  uuid(payload.sub);uuid(payload.installation_id);
  const install=(await client.query("SELECT id FROM installer.installations WHERE id=$1 AND status='PAIRED' FOR UPDATE",[payload.installation_id])).rows[0];
  if(!install)fail(401,'AGENT_AUTH_REQUIRED');
  const device=(await client.query('SELECT * FROM installer.devices WHERE id=$1 AND installation_id=$2 AND revoked_at IS NULL FOR UPDATE',[payload.sub,payload.installation_id])).rows[0];
  if(!device||payload.cnf?.jkt!==device.thumbprint||!Array.isArray(payload.scopes)||!payload.scopes.includes(requiredScope)||(payload.key_epoch??1)!==device.key_epoch) fail(401,'AGENT_AUTH_REQUIRED');
  const {key}=await deviceKey(device.public_jwk);
  let proof;
  try { ({payload:proof}=await jwtVerify(text(request.headers.get('dpop'),30,4096),key,{algorithms:['EdDSA'],typ:'dpop+jwt',requiredClaims:['htm','htu','ath','nonce','iat','jti'],maxTokenAge:'60s',clockTolerance:5})); }
  catch { fail(401,'INVALID_DEVICE_PROOF'); }
  if(!Number.isSafeInteger(proof.iat)||proof.htm!==request.method||proof.htu!==request.url||proof.nonce!==device.nonce||proof.ath!==Buffer.from(hash(token),'hex').toString('base64url')||proof.iat>Math.floor(Date.now()/1000)+5) fail(401,'INVALID_DEVICE_PROOF');
  if(bodyHash && proof.bht!==bodyHash)fail(401,'INVALID_DEVICE_PROOF');
  uuid(proof.jti);
  await client.query('DELETE FROM installer.proof_replays WHERE expires_at<now()');
  const inserted=await client.query('INSERT INTO installer.proof_replays(thumbprint,jti_hash,expires_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING jti_hash',[device.thumbprint,hash(proof.jti),new Date((proof.iat+65)*1000)]);
  if(!inserted.rowCount)fail(409,'PROOF_REPLAY');
  return {installation_id:device.installation_id,device_id:device.id,scopes:payload.scopes,key_epoch:device.key_epoch,public_key_thumbprint:device.thumbprint};
}

// Recheck after an external grant operation; no prior authorization snapshot may
// survive seller revocation or device-key rotation in the meantime.
export async function assertActiveAgent(client,principal) {
 const install=(await client.query("SELECT id FROM installer.installations WHERE id=$1 AND status='PAIRED' FOR UPDATE",[principal.installation_id])).rows[0];
 if(!install)fail(401,'AGENT_AUTH_REQUIRED');
 const row=(await client.query('SELECT id FROM installer.devices WHERE id=$1 AND installation_id=$2 AND key_epoch=$3 AND thumbprint=$4 AND revoked_at IS NULL FOR UPDATE',[principal.device_id,principal.installation_id,principal.key_epoch,principal.public_key_thumbprint])).rows[0];
 if(!row)fail(401,'AGENT_AUTH_REQUIRED');
 return true;
}
