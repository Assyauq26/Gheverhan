import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { SignJWT } from 'jose';
import { ApiError, exact, fail, hash, opaque, text, uuid } from './common.mjs';
import { rate, transaction } from './db.mjs';

const clearFlow='__Host-js_email_flow=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax';
const mailEndpoint='https://api.resend.com/emails';
const response=(status,body,extra={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',...extra}});
const statusHeaders=request=>request.headers.get('origin')==='https://buattokosendiri.web.id'?{'Access-Control-Allow-Origin':'https://buattokosendiri.web.id','Vary':'Origin'}:{'Vary':'Origin'};
function canonicalEmail(value) {
  if(typeof value!=='string'||value.length>254||/[\x00-\x20\x7f]/.test(value)||!/^[^@]+@[^@]+\.[^@]+$/.test(value))fail(400,'INVALID_REQUEST');
  return value.toLowerCase();
}
export function validateEmailAuth(config) {
  if(!config)return;
  if(typeof config.resendApiKey!=='string'||config.resendApiKey.length<16||/[\r\n]/.test(config.resendApiKey)||
    typeof config.from!=='string'||config.from.length>320||/[\r\n]/.test(config.from)||!config.from.includes('@')||
    typeof config.otpPepper!=='string'||!/^[a-f0-9]{64}$/.test(config.otpPepper)||!config.sessionSigningKey)throw Error('Private email authentication configuration required');
}
function testTransport(pool,fetchImpl) {
  if(fetchImpl===globalThis.fetch)return;
  // A delivery double is accepted only for the isolated PostgreSQL fixture.
  // Runtime JSON has no URL/sink/transport override and never invokes this path.
  const url=new URL(pool.options?.connectionString??'invalid');
  if(process.env.JETSELLER_CONTROL_TEST_CONFIRM!=='isolated-control-fixture'||url.pathname!=='/js_control_fixture'||!['127.0.0.1','localhost'].includes(url.hostname))throw Error('Isolated email transport required');
}
const codeDigest=(config,id,code)=>createHmac('sha256',Buffer.from(config.otpPepper,'hex')).update(id+'\0'+code).digest('hex');
async function readBody(request) {
  if(!request.headers.get('content-type')?.startsWith('application/json'))fail(415,'JSON_REQUIRED');
  const reader=request.body?.getReader();if(!reader)fail(400,'INVALID_REQUEST');
  const chunks=[];let bytes=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>4096)fail(413,'BODY_TOO_LARGE');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail(400,'INVALID_REQUEST');}
}
/** Passwordless identity uses this control database, never the merchant DB. */
export function createEmailAuthHandler({pool,controlOrigin,config,fetchImpl=globalThis.fetch}) {
  validateEmailAuth(config);testTransport(pool,fetchImpl);
  return async(request,{clientAddress='unknown'}={})=>{
    try {
      const url=new URL(request.url);
      if(url.origin!==controlOrigin||url.search||url.hash)fail(400,'INVALID_REQUEST');
      if(url.pathname==='/auth/status') {
        if(request.method!=='GET')fail(405,'METHOD_NOT_ALLOWED');
        return response(200,{configured:!!config,method:'email_otp',registration_url:config?'/daftar':null,login_url:config?'/masuk':null,
          logout_url:'/api/installer/v1/session/logout',logout_scope:'local_portal_session'},statusHeaders(request));
      }
      if(!['/auth/email/start','/auth/email/verify'].includes(url.pathname))fail(404,'NOT_FOUND');
      if(!config)fail(503,'AUTH_UNAVAILABLE');
      if(request.method!=='POST')fail(405,'METHOD_NOT_ALLOWED');
      if(request.headers.get('origin')!==controlOrigin)fail(403,'CSRF_REJECTED');
      if(url.pathname==='/auth/email/start') {
        const b=exact(await readBody(request),['mode','email','name','store_name']);
        if(!['register','login'].includes(b.mode))fail(400,'INVALID_REQUEST');
        const email=canonicalEmail(b.email),emailHash=hash('email-auth:'+email);
        const name=b.mode==='register'?text(b.name,1,100):null,storeName=b.mode==='register'?text(b.store_name,1,100):null;
        await rate(pool,'email-start-ip:'+clientAddress,10,600);await rate(pool,'email-start-address:'+emailHash,5,3600);
        const id=randomUUID(),cookie=opaque(),code=String(randomInt(0,1000000)).padStart(6,'0');
        await transaction(pool,async client=>{
          await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['email-auth:'+emailHash]);
          const recent=(await client.query("SELECT id FROM installer.email_challenges WHERE email_hash=$1 AND created_at>now()-interval '60 seconds' LIMIT 1",[emailHash])).rows[0];
          if(recent)fail(429,'RATE_LIMITED');
          await client.query('UPDATE installer.email_challenges SET consumed_at=now() WHERE email_hash=$1 AND consumed_at IS NULL',[emailHash]);
          await client.query("INSERT INTO installer.email_challenges(id,email_hash,email,mode,display_name,store_name,cookie_hash,code_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '10 minutes')",[id,emailHash,email,b.mode,name,storeName,hash(cookie),codeDigest(config,id,code)]);
        });
        let delivered=false;
        try {
          const sent=await fetchImpl(mailEndpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{authorization:'Bearer '+config.resendApiKey,'content-type':'application/json'},
            body:JSON.stringify({from:config.from,to:[email],subject:'Kode masuk Buat Toko Online Sendiri',text:'Kode verifikasi Buat Toko Online Sendiri: '+code+'\nBerlaku 10 menit, maksimal 5 percobaan. Jangan berikan kode ini kepada siapa pun. Jika Anda tidak meminta kode ini, abaikan email ini.'})});
          delivered=sent.ok;await sent.body?.cancel();
        }catch{ /* Provider errors never disclose recipients, keys or request bodies. */ }
        if(!delivered){await pool.query('UPDATE installer.email_challenges SET consumed_at=now() WHERE id=$1',[id]);fail(503,'AUTH_UNAVAILABLE');}
        await pool.query('UPDATE installer.email_challenges SET delivered_at=now() WHERE id=$1 AND consumed_at IS NULL',[id]);
        return response(200,{status:'OTP_SENT',challenge_id:id,expires_in:600,resend_after:60},{'Set-Cookie':`__Host-js_email_flow=${cookie}; Path=/; Max-Age=600; Secure; HttpOnly; SameSite=Lax`});
      }
      await rate(pool,'email-verify-ip:'+clientAddress,30,600);
      const b=exact(await readBody(request),['challenge_id','code']);uuid(b.challenge_id);
      if(typeof b.code!=='string'||!/^\d{6}$/.test(b.code))fail(401,'OTP_INVALID');
      const cookies=(request.headers.get('cookie')??'').split(';').map(value=>value.trim()).filter(value=>value.startsWith('__Host-js_email_flow='));
      if(cookies.length!==1)fail(401,'OTP_INVALID');const cookie=cookies[0].slice('__Host-js_email_flow='.length);
      if(!/^[A-Za-z0-9_-]{43}$/.test(cookie))fail(401,'OTP_INVALID');
      const sid=randomUUID(),csrf=opaque();
      const outcome=await transaction(pool,async client=>{
        const challenge=(await client.query('SELECT * FROM installer.email_challenges WHERE id=$1 AND cookie_hash=$2 FOR UPDATE',[b.challenge_id,hash(cookie)])).rows[0];
        if(!challenge||challenge.consumed_at||!challenge.delivered_at||challenge.attempts>=5)return {error:'OTP_INVALID',status:401};
        if(new Date(challenge.expires_at)<=new Date())return {error:'OTP_EXPIRED',status:410};
        const valid=timingSafeEqual(Buffer.from(challenge.code_hash,'hex'),Buffer.from(codeDigest(config,challenge.id,b.code),'hex'));
        if(!valid) {
          await client.query('UPDATE installer.email_challenges SET attempts=attempts+1,consumed_at=CASE WHEN attempts>=4 THEN now() ELSE consumed_at END WHERE id=$1',[challenge.id]);
          return {error:'OTP_INVALID',status:401};
        }
        await client.query('UPDATE installer.email_challenges SET consumed_at=now() WHERE id=$1',[challenge.id]);
        let seller=(await client.query('SELECT id,external_subject FROM installer.sellers WHERE email_hash=$1 AND email_verified=true',[challenge.email_hash])).rows[0];
        if(!seller) {
          if(challenge.mode!=='register')return {error:'PROFILE_REQUIRED',status:409};
          // No merge by an unverified claim, or with unrelated OIDC identities.
          seller=(await client.query(`INSERT INTO installer.sellers(id,external_subject,email_hash,email,email_verified,display_name,store_name) VALUES($1,$2,$3,$4,true,$5,$6)
            ON CONFLICT(email_hash) WHERE email_hash IS NOT NULL DO UPDATE SET email_verified=true RETURNING id,external_subject`,[randomUUID(),hash('email\0'+challenge.email),challenge.email_hash,challenge.email,challenge.display_name,challenge.store_name])).rows[0];
        }
        await client.query("INSERT INTO installer.sessions(id,seller_id,csrf_hash,expires_at,authenticated_at) VALUES($1,$2,$3,now()+interval '1 hour',now())",[sid,seller.id,hash(csrf)]);
        return {subject:seller.external_subject};
      });
      if(outcome.error)fail(outcome.status,outcome.error);
      const token=await new SignJWT({sid,csrf,email_verified:true}).setProtectedHeader({alg:'EdDSA'}).setSubject(outcome.subject).setIssuer(controlOrigin).setAudience('jetseller-portal').setIssuedAt().setExpirationTime('1h').sign(config.sessionSigningKey);
      const headers=new Headers({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
      headers.append('Set-Cookie',clearFlow);headers.append('Set-Cookie',`__Host-js_portal_session=${token}; Path=/; Max-Age=3600; Secure; HttpOnly; SameSite=Lax`);
      return Response.json({status:'AUTHENTICATED'},{status:200,headers});
    }catch(error){return response(error instanceof ApiError?error.status:503,{error:{code:error instanceof ApiError?error.code:'AUTH_UNAVAILABLE'}},error instanceof ApiError&&error.code==='RATE_LIMITED'?{'Retry-After':'60'}:{});}
  };
}
