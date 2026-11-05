import {createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {CONSENT_VERSION,validateRegistration} from './validation.mjs';

const reply=(status,data,extra={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&/^[a-f0-9]{64}$/.test(a)&&/^[a-f0-9]{64}$/.test(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function createRegistrationApi({pool,origin,secret,now=()=>Date.now()}) {
  if(!secret||Buffer.byteLength(secret)<32)throw new Error('Registration secret required');
  const hash=(purpose,value)=>createHmac('sha256',secret).update(purpose+'\0'+value).digest('hex');
  async function rate(client,key,window,maximum){
    const bucket=Math.floor(now()/window);
    const r=await client.query('INSERT INTO registration.rate_limits(key_hash,bucket,hits,expires_at) VALUES($1,$2,1,to_timestamp($3)) ON CONFLICT(key_hash,bucket) DO UPDATE SET hits=registration.rate_limits.hits+1 RETURNING hits',[hash('rate',key),bucket,((bucket+1)*window)/1000]);
    return r.rows[0].hits<=maximum;
  }
  function challenge(ip){const payload=Buffer.from(JSON.stringify({n:randomBytes(24).toString('hex'),t:now(),ip:hash('ip',ip)})).toString('base64url');return payload+'.'+hash('challenge',payload);}
  function parseChallenge(token,ip){
    if(typeof token!=='string'||token.length>512)return null;
    const [payload,signature,...rest]=token.split('.');if(rest.length||!equal(signature,hash('challenge',payload??'')))return null;
    try{const v=JSON.parse(Buffer.from(payload,'base64url'));return /^[a-f0-9]{48}$/.test(v.n)&&v.ip===hash('ip',ip)&&Number.isSafeInteger(v.t)&&now()-v.t>=1500&&now()-v.t<=1800000?v:null;}catch{return null;}
  }
  return async function handle(request,{clientAddress}){
    const path=new URL(request.url).pathname;
    if(path==='/api/registration/challenge'&&request.method==='GET'){
      if(request.headers.get('sec-fetch-site')==='cross-site')return reply(403,{error:'ORIGIN_DENIED'});
      if(!await rate(pool,'challenge:'+clientAddress,600000,40))return reply(429,{error:'RATE_LIMITED'},{'Retry-After':'600'});
      return reply(200,{challenge:challenge(clientAddress),consentVersion:CONSENT_VERSION});
    }
    if(path!=='/api/registration'||request.method!=='POST')return reply(404,{error:'NOT_FOUND'});
    if(request.headers.get('origin')!==origin||request.headers.get('sec-fetch-site')==='cross-site')return reply(403,{error:'ORIGIN_DENIED'});
    if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')??''))return reply(415,{error:'JSON_REQUIRED'});
    const key=request.headers.get('idempotency-key');
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(key??''))return reply(400,{error:'IDEMPOTENCY_REQUIRED'});
    if(!await rate(pool,'attempt:'+clientAddress,600000,30))return reply(429,{error:'RATE_LIMITED'},{'Retry-After':'600'});
    let input;try{const text=await request.text();if(Buffer.byteLength(text)>8192)return reply(413,{error:'REQUEST_TOO_LARGE'});input=JSON.parse(text);}catch{return reply(400,{error:'INVALID_JSON'});}
    const {data,errors}=validateRegistration(input);if(Object.keys(errors).length)return reply(422,{error:'VALIDATION_FAILED',fields:errors});
    const keyHash=hash('request',key),payloadHash=hash('payload',JSON.stringify(data));
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[keyHash]);
      const previous=await client.query('SELECT r.payload_hash,e.reference_code FROM registration.requests r JOIN registration.entries e ON e.id=r.entry_id WHERE r.key_hash=$1',[keyHash]);
      if(previous.rowCount){await client.query('COMMIT');return previous.rows[0].payload_hash===payloadHash?reply(200,{referenceCode:previous.rows[0].reference_code,status:'REGISTERED'}):reply(409,{error:'IDEMPOTENCY_CONFLICT'});}
      const proof=parseChallenge(input.challenge,clientAddress);
      if(!proof){await client.query('ROLLBACK');return reply(400,{error:'CHALLENGE_EXPIRED'});}
      const consumed=await client.query('INSERT INTO registration.challenges(nonce_hash,request_hash,expires_at) VALUES($1,$2,to_timestamp($3)) ON CONFLICT DO NOTHING RETURNING nonce_hash',[hash('nonce',proof.n),keyHash,(proof.t+1800000)/1000]);
      if(!consumed.rowCount){await client.query('ROLLBACK');return reply(409,{error:'CHALLENGE_USED'});}
      // Limits committed even on rejected requests; no durable raw IP address.
      if(!await rate(client,'submit:'+clientAddress,3600000,5)||!await rate(client,'email:'+data.email,86400000,3)){
        await client.query('COMMIT');return reply(429,{error:'RATE_LIMITED'},{'Retry-After':'3600'});
      }
      const id=randomUUID(),referenceCode='BTOS-'+randomBytes(12).toString('hex').toUpperCase();
      await client.query('INSERT INTO registration.entries(id,reference_code,full_name,email,whatsapp,store_name,category,domain,city,description,consent_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id,referenceCode,data.fullName,data.email,data.whatsapp,data.storeName,data.category,data.domain,data.city,data.description,data.consentVersion]);
      await client.query('INSERT INTO registration.requests(key_hash,payload_hash,entry_id) VALUES($1,$2,$3)',[keyHash,payloadHash,id]);
      await client.query('COMMIT');
      return reply(201,{referenceCode,status:'REGISTERED'});
    }catch{await client.query('ROLLBACK').catch(()=>{});return reply(503,{error:'REGISTRATION_UNAVAILABLE'});}finally{client.release();}
  };
}
