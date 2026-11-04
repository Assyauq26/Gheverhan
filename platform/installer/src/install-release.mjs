import { decodeJwt, jwtVerify } from 'jose';
import { ApiError, fail, hash, uuid, exact, text } from './common.mjs';
import { sellerAuthenticator, agentIdentity, deviceKey, credential } from './auth.mjs';
import { transaction } from './db.mjs';

const prefix='/api/installer/v1', digest=/^[a-f0-9]{64}$/;
const phases=['PREFLIGHT','VERIFIED_RELEASE','DATABASE','MIGRATION','APPLICATION','HTTPS_PENDING','LOCAL_READINESS'];
const response=(status,value)=>Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
function https(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.hash)fail(503,'RELEASE_UNAVAILABLE');return u.href;}
// The catalog is operator-owned publication configuration plus a receipt from
// the independently trusted offline verifier. Browser clients never select roots.
export function validateReleaseCatalog(value,now=Date.now()) {
 if(!value||value.version!==1||!/^rel-[0-9]+\.[0-9]+\.[0-9]+(?:-rc\.[0-9]+)?-(internal|pilot|stable)$/.test(value.release_id)||!digest.test(value.manifest_sha256)||!digest.test(value.root_sha256)||!digest.test(value.policy_sha256)||!digest.test(value.installer?.sha256)||!value.verification_receipt||(!Number.isFinite(Date.parse(value.expires_at))||Date.parse(value.expires_at)<=now))fail(503,'RELEASE_UNAVAILABLE');
 const receipt=value.verification_receipt;
 if(receipt.status!=='VERIFIED'||receipt.manifest_sha256!==value.manifest_sha256||receipt.root_sha256!==value.root_sha256||receipt.release_id!==value.release_id||Date.parse(receipt.expires_at)<Date.parse(value.expires_at)||!Number.isFinite(Date.parse(receipt.expires_at)))fail(503,'RELEASE_UNAVAILABLE');
 if(!value.release_bundle||!digest.test(value.release_bundle.sha256))fail(503,'RELEASE_UNAVAILABLE');https(value.release_bundle.url);
 for(const link of [value.installer.url,value.installer.signature_url,value.policy_url])https(link);
 return value;
}
export function createInstallReleaseHandler({pool,verificationKey,controlOrigin,sessionIssuer,signingKey,getCatalog=async()=>null}) {
 const sellerAuth=sellerAuthenticator(pool,sessionIssuer);
 return async(request)=>{
  const url=new URL(request.url);if(url.origin!==controlOrigin||url.search||url.hash)return response(400,{error:{code:'INVALID_REQUEST'}});
  const path=url.pathname;
  const sellerPath=path.match(/^\/api\/installer\/v1\/installations\/([^/]+)\/(install-instructions|install-progress)$/);
  if(!sellerPath&&!['/agent/install-authorization','/agent/install-progress','/agent/credential/refresh'].some(route=>path===prefix+route))return null;
  try {
   if(sellerPath){
    if(request.method!=='GET')fail(405,'METHOD_NOT_ALLOWED');const seller=await sellerAuth(request),id=uuid(sellerPath[1]);
    const record=(await pool.query('SELECT id,domain FROM installer.installations WHERE id=$1 AND seller_id=$2 AND status<>\'CANCELLED\'',[id,seller.seller_id])).rows[0];if(!record)fail(404,'NOT_FOUND');
    if(sellerPath[2]==='install-progress'){
     const progress=(await pool.query('SELECT phase,sequence,updated_at,error_code FROM installer.install_progress WHERE installation_id=$1',[id])).rows[0];
     return response(200,{installation_id:id,phase:progress?.phase??'NOT_STARTED',sequence:Number(progress?.sequence??0),updated_at:progress?.updated_at??null,error_code:progress?.error_code??null,store_origin:'https://'+record.domain,evidence_source:'DEVICE_REPORT_NOT_PUBLIC_TLS_ATTESTATION'});
    }
    let catalog;try{catalog=validateReleaseCatalog(await getCatalog());}catch{return response(200,{installation_id:id,available:false,reason:'RELEASE_UNAVAILABLE'});}
    return response(200,{installation_id:id,available:true,release_bundle_available:true,release_id:catalog.release_id,installer:catalog.installer,control_origin:controlOrigin,policy_url:catalog.policy_url,policy_sha256:catalog.policy_sha256,root_sha256:catalog.root_sha256,manifest_sha256:catalog.manifest_sha256});
   }
   if((path.endsWith('install-authorization')&&request.method!=='GET')||(path.endsWith('install-progress')&&request.method!=='POST'))fail(405,'METHOD_NOT_ALLOWED');
   let raw='';if(request.method==='POST'){raw=await request.text();if(Buffer.byteLength(raw)>4096)fail(413,'BODY_TOO_LARGE');}
   return await transaction(pool,async client=>{
    if(path===prefix+'/agent/credential/refresh'){
     if(request.method!=='POST'||!signingKey)fail(405,'METHOD_NOT_ALLOWED');let b;try{b=exact(JSON.parse(raw),['installation_id','device_id','proof']);}catch{fail(400,'INVALID_REQUEST');}
     uuid(b.installation_id);uuid(b.device_id);
     const device=(await client.query("SELECT d.* FROM installer.devices d JOIN installer.installations i ON i.id=d.installation_id WHERE d.id=$1 AND d.installation_id=$2 AND d.revoked_at IS NULL AND i.status='PAIRED' FOR UPDATE OF d",[b.device_id,b.installation_id])).rows[0];if(!device)fail(401,'AGENT_AUTH_REQUIRED');
     const {key}=await deviceKey(device.public_jwk);let proof;try{({payload:proof}=await jwtVerify(text(b.proof,30,4096),key,{algorithms:['EdDSA'],typ:'jetseller-management+jwt',audience:controlOrigin,requiredClaims:['iat','exp','jti','nonce','operation','request_hash'],maxTokenAge:'60s',clockTolerance:5}));}catch{fail(401,'INVALID_DEVICE_PROOF');}
     if(!Number.isSafeInteger(proof.iat)||!Number.isSafeInteger(proof.exp)||proof.iat>Math.floor(Date.now()/1000)+5||proof.exp>proof.iat+60||proof.nonce!==device.nonce||proof.operation!=='refresh_installation_credential'||proof.request_hash!==hash(JSON.stringify({installation_id:b.installation_id,device_id:b.device_id})))fail(401,'INVALID_DEVICE_PROOF');uuid(proof.jti);
     const used=await client.query("INSERT INTO installer.proof_replays(thumbprint,jti_hash,expires_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING jti_hash",[device.thumbprint,hash(proof.jti),new Date((proof.exp+5)*1000)]);if(!used.rowCount)fail(409,'PROOF_REPLAY');
     return response(200,await credential(signingKey,controlOrigin,device,device.id,device.approved_scopes));
    }
    const agent=await agentIdentity(request,client,verificationKey,controlOrigin);
    const scope=request.method==='GET'?'release:read':'install:progress';if(!agent.scopes.includes(scope))fail(403,'SCOPE_REQUIRED');
    const record=(await client.query("SELECT * FROM installer.installations WHERE id=$1 AND status='PAIRED' FOR UPDATE",[agent.installation_id])).rows[0];if(!record)fail(409,'INSTALLATION_NOT_PAIRED');
    if(request.method==='GET'){
     const catalog=validateReleaseCatalog(await getCatalog());
     const proof=(await client.query("SELECT verified_at,expires_at FROM installer.domain_challenges WHERE installation_id=$1 AND domain=$2 AND verified_at IS NOT NULL AND verified_at<=expires_at AND expires_at>now() AND verified_at>now()-interval '30 minutes' ORDER BY verified_at DESC LIMIT 1",[record.id,record.domain])).rows[0];
     if(!proof||record.reserved_domain!==record.domain||Date.parse(record.claim_expires_at)<=Date.now())fail(409,'FRESH_DOMAIN_PROOF_REQUIRED');
     return response(200,{installation_id:record.id,device_id:agent.device_id,domain:record.domain,display_name:record.display_name,release_id:catalog.release_id,manifest_sha256:catalog.manifest_sha256,release_bundle_url:catalog.release_bundle?.url??null,release_bundle_sha256:catalog.release_bundle?.sha256??null,domain_verified_at:proof.verified_at,expires_at:new Date(Math.min(Date.now()+120000,Date.parse(proof.expires_at),Date.parse(record.claim_expires_at),Date.parse(catalog.expires_at))).toISOString()});
    }
    // The same JWS was cryptographically verified by agentIdentity above.
    const proof=decodeJwt(request.headers.get('dpop'));if(proof.body_sha256!==Buffer.from(hash(raw),'hex').toString('base64url'))fail(401,'INVALID_DEVICE_PROOF');
    let b;try{b=exact(JSON.parse(raw),['installation_id','release_id','manifest_sha256','phase','sequence','error_code']);}catch{fail(400,'INVALID_REQUEST');}
    if(uuid(b.installation_id)!==agent.installation_id||!Number.isSafeInteger(b.sequence)||b.sequence<1||!digest.test(b.manifest_sha256)||!phases.includes(b.phase))fail(400,'INVALID_REQUEST');
    const catalog=validateReleaseCatalog(await getCatalog());if(b.release_id!==catalog.release_id||b.manifest_sha256!==catalog.manifest_sha256)fail(409,'RELEASE_CHANGED');
    if(b.error_code!==null&&b.error_code!==undefined&&!['INSTALL_BLOCKED','HTTPS_PENDING','CONTROL_UNAVAILABLE'].includes(b.error_code))fail(400,'INVALID_REQUEST');
    const previous=(await client.query('SELECT * FROM installer.install_progress WHERE installation_id=$1 FOR UPDATE',[record.id])).rows[0];
    if(previous){
     if(previous.device_id!==agent.device_id||previous.manifest_sha256!==b.manifest_sha256)fail(409,'INSTALLATION_CONFLICT');
     if(b.sequence===Number(previous.sequence)&&b.phase===previous.phase&&b.error_code==previous.error_code)return response(200,{accepted:true,sequence:b.sequence});
     if(b.sequence!==Number(previous.sequence)+1||(phases.indexOf(b.phase)<phases.indexOf(previous.phase)||phases.indexOf(b.phase)>phases.indexOf(previous.phase)+1))fail(409,'PROGRESS_CONFLICT');
    }else if(b.sequence!==1||b.phase!=='PREFLIGHT')fail(409,'PROGRESS_CONFLICT');
    await client.query(`INSERT INTO installer.install_progress(installation_id,device_id,release_id,manifest_sha256,phase,sequence,error_code) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(installation_id) DO UPDATE SET phase=excluded.phase,sequence=excluded.sequence,error_code=excluded.error_code,updated_at=now()`,[record.id,agent.device_id,b.release_id,b.manifest_sha256,b.phase,b.sequence,b.error_code??null]);
    // This is device-reported progress only. Do not manufacture INSTALLED/READY.
    return response(200,{accepted:true,sequence:b.sequence});
   });
  }catch(error){return response(error instanceof ApiError?error.status:503,{error:{code:error instanceof ApiError?error.code:'INSTALL_UNAVAILABLE'}});}
 };
}
