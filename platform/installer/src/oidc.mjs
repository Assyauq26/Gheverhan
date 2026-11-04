import { createLocalJWKSet,jwtVerify,SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { ApiError,fail,hash,opaque,text } from './common.mjs';
import { rate,transaction } from './db.mjs';

export function validateOidc(config,controlOrigin) {
  if(!config)return;
  const issuer=new URL(config.issuer);
  if(issuer.protocol!=='https:'||issuer.username||issuer.password||issuer.search||issuer.hash)throw new Error('Invalid OIDC issuer');
  for(const field of ['authorizationEndpoint','tokenEndpoint',...(config.registrationEndpoint!==undefined?['registrationEndpoint']:[])]) {
    const value=new URL(config[field]);
    if(value.protocol!=='https:'||value.origin!==issuer.origin||value.username||value.password||value.search||value.hash)throw new Error('Invalid OIDC endpoint');
  }
  if(config.redirectUri!==controlOrigin+'/auth/callback'||typeof config.clientId!=='string'||!config.clientId.trim()||config.clientId.length>200||/[\r\n]/.test(config.clientId)||!config.sessionSigningKey||!config.jwks?.keys?.length)throw new Error('Invalid OIDC configuration');
  if(config.tokenEndpointAuthMethod!==undefined&&!['none','client_secret_basic'].includes(config.tokenEndpointAuthMethod))throw new Error('Invalid OIDC token authentication');
  if(config.tokenEndpointAuthMethod==='client_secret_basic') {
    if(typeof config.clientSecret!=='string'||config.clientSecret.length<16||config.clientSecret.length>4096||/[\r\n]/.test(config.clientSecret))throw new Error('Private OIDC client credential required');
  } else if(config.clientSecret!==undefined)throw new Error('Unexpected OIDC client credential');
  // Provider keys are pinned public asymmetric keys, never an embedded secret.
  if(config.jwks.keys.some(key=>key.d||key.k||!['RSA','EC','OKP'].includes(key.kty)))throw new Error('Invalid OIDC keys');
}
function result(status,value,headers={}) {
  return Response.json(value,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer',...headers}});
}
const clearLogin='__Host-js_oidc=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax';

/** Authorization Code + PKCE. Provider account registration/verification stays
 * at the configured issuer. No fallback credentials or development login. */
export function createOidcHandler({pool,controlOrigin,config,fetchImpl=fetch}) {
  validateOidc(config,controlOrigin);
  const keys=config?createLocalJWKSet(config.jwks):undefined;
  return async(request,{clientAddress='unknown'}={})=>{
    try {
      const url=new URL(request.url);
      if(url.origin!==controlOrigin||url.hash)fail(400,'INVALID_REQUEST');
      if(request.method!=='GET')fail(405,'METHOD_NOT_ALLOWED');
      if(url.pathname==='/auth/status') {
        if(url.search)fail(400,'INVALID_REQUEST');
        const headers=request.headers.get('origin')==='https://buattokosendiri.web.id'?{'Access-Control-Allow-Origin':'https://buattokosendiri.web.id','Vary':'Origin'}:{'Vary':'Origin'};
        return result(200,{configured:!!config,login_url:config?'/auth/login':null,
          registration_url:config?.registrationEndpoint?'/auth/register':null,
          logout_url:'/api/installer/v1/session/logout',logout_scope:'local_portal_session'},headers);
      }
      if(!config)fail(503,'AUTH_UNAVAILABLE');
      await rate(pool,'oidc:'+clientAddress,10);
      if(url.pathname==='/auth/login'||url.pathname==='/auth/register'||url.pathname==='/auth/signup') {
        if(url.search)fail(400,'INVALID_REQUEST');
        const endpoint=url.pathname==='/auth/login'?config.authorizationEndpoint:config.registrationEndpoint;
        if(!endpoint)fail(503,'REGISTRATION_UNAVAILABLE');
        const state=opaque(),nonce=opaque(),verifier=opaque(),cookie=opaque();
        await pool.query('DELETE FROM installer.oidc_logins WHERE expires_at<now()');
        await pool.query("INSERT INTO installer.oidc_logins(cookie_hash,state_hash,nonce_hash,verifier,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')",[hash(cookie),hash(state),hash(nonce),verifier]);
        const authorization=new URL(endpoint);
        for(const [key,value]of Object.entries({response_type:'code',client_id:config.clientId,redirect_uri:config.redirectUri,scope:'openid email',state,nonce,code_challenge:Buffer.from(hash(verifier),'hex').toString('base64url'),code_challenge_method:'S256'}))authorization.searchParams.set(key,value);
        return new Response(null,{status:302,headers:{location:authorization.href,'cache-control':'no-store','referrer-policy':'no-referrer','set-cookie':`__Host-js_oidc=${cookie}; Path=/; Max-Age=600; Secure; HttpOnly; SameSite=Lax`}});
      }
      if(url.pathname==='/auth/callback') {
        if([...url.searchParams.keys()].some(k=>!['code','state','iss','session_state'].includes(k))||url.searchParams.getAll('code').length!==1||url.searchParams.getAll('state').length!==1)fail(400,'INVALID_CALLBACK');
        if(url.searchParams.getAll('iss').length>1||(url.searchParams.has('iss')&&url.searchParams.get('iss')!==config.issuer))fail(400,'INVALID_CALLBACK');
        const code=text(url.searchParams.get('code'),1,2048),state=text(url.searchParams.get('state'),32,128);
        const cookies=(request.headers.get('cookie')??'').split(';').map(x=>x.trim()).filter(x=>x.startsWith('__Host-js_oidc='));
        if(cookies.length!==1)fail(400,'INVALID_CALLBACK');
        const cookie=text(cookies[0].slice('__Host-js_oidc='.length),43,43);
        // Atomically consume before token exchange; failed exchange must restart login.
        const login=(await pool.query('UPDATE installer.oidc_logins SET consumed_at=now() WHERE cookie_hash=$1 AND state_hash=$2 AND consumed_at IS NULL AND expires_at>now() RETURNING *',[hash(cookie),hash(state)])).rows[0];
        if(!login)fail(400,'INVALID_CALLBACK');
        const exchangeHeaders={'content-type':'application/x-www-form-urlencoded'};
        const exchange=new URLSearchParams({grant_type:'authorization_code',client_id:config.clientId,redirect_uri:config.redirectUri,code,code_verifier:login.verifier});
        if(config.tokenEndpointAuthMethod==='client_secret_basic') {
          // Credentials originate only from the private local configuration.
          // Never include them in redirect URLs, browser data or public errors.
          const encode=value=>new URLSearchParams({value}).toString().slice(6);
          exchangeHeaders.authorization='Basic '+Buffer.from(encode(config.clientId)+':'+encode(config.clientSecret)).toString('base64');
        }
        const response=await fetchImpl(config.tokenEndpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:exchangeHeaders,body:exchange});
        if(!response.ok)fail(401,'AUTH_REQUIRED');
        const chunks=[];let bytes=0;
        if(!response.body)fail(401,'AUTH_REQUIRED');
        const reader=response.body.getReader();
        try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>32768)fail(401,'AUTH_REQUIRED');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
        const raw=Buffer.concat(chunks).toString('utf8');
        const tokens=JSON.parse(raw);text(tokens.id_token,30,16384);
        const {payload}=await jwtVerify(tokens.id_token,keys,{algorithms:['RS256','ES256','EdDSA'],issuer:config.issuer,audience:config.clientId,requiredClaims:['sub','iat','exp','nonce'],maxTokenAge:'10m',clockTolerance:5});
        if(hash(String(payload.nonce))!==login.nonce_hash||payload.email_verified!==true||(payload.azp!==undefined&&payload.azp!==config.clientId)||(Array.isArray(payload.aud)&&payload.aud.length>1&&payload.azp!==config.clientId))fail(403,'ACCOUNT_NOT_VERIFIED');
        // A verified flag without the actual bounded email claim is insufficient.
        // Keep the account key issuer+subject; do not merge sellers by email.
        if(typeof payload.email!=='string'||payload.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email))fail(403,'ACCOUNT_NOT_VERIFIED');
        text(payload.sub,1,200);
        const sid=randomUUID(),csrf=opaque(),subject=hash(config.issuer+'\0'+payload.sub);
        const seller=await transaction(pool,async c=>{
          const record=(await c.query('INSERT INTO installer.sellers(id,external_subject,email_verified) VALUES($1,$2,true) ON CONFLICT(external_subject) DO UPDATE SET email_verified=true RETURNING id',[randomUUID(),subject])).rows[0];
          await c.query("INSERT INTO installer.sessions(id,seller_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[sid,record.id,hash(csrf)]);
          return record.id;
        });
        const token=await new SignJWT({sid,csrf,email_verified:true}).setProtectedHeader({alg:'EdDSA'}).setSubject(subject).setIssuer(controlOrigin).setAudience('jetseller-portal').setIssuedAt().setExpirationTime('1h').sign(config.sessionSigningKey);
        const headers=new Headers({'location':'/','cache-control':'no-store','referrer-policy':'no-referrer'});
        headers.append('set-cookie',clearLogin);headers.append('set-cookie',`__Host-js_portal_session=${token}; Path=/; Max-Age=3600; Secure; HttpOnly; SameSite=Lax`);
        return new Response(null,{status:302,headers});
      }
      fail(404,'NOT_FOUND');
    }catch(error){return result(error instanceof ApiError?error.status:401,{error:{code:error instanceof ApiError?error.code:'AUTH_REQUIRED'}},{'set-cookie':clearLogin});}
  };
}
