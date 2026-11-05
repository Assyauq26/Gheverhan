import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {createRegistrationApi} from '../src/api.mjs';
import {CONSENT_VERSION} from '../src/validation.mjs';
const url=process.env.BTOS_REGISTRATION_TEST_DATABASE_URL;
if(process.env.BTOS_REGISTRATION_TEST_CONFIRM!=='isolated-registration-fixture'||!url||!new URL(url).pathname.endsWith('_fixture'))throw new Error('Isolated fixture database required');
const owner=new pg.Pool({connectionString:url});
const password='synthetic-registration-only';
await owner.query("DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='btos_registration_runtime') THEN CREATE ROLE btos_registration_runtime LOGIN PASSWORD 'synthetic-registration-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT; END IF; END $$");
await owner.query(await readFile(new URL('../migrations/001_registration.sql',import.meta.url),'utf8'));
await owner.query(await readFile(new URL('../migrations/001_registration.sql',import.meta.url),'utf8'));
const runtimeUrl=new URL(url);runtimeUrl.username='btos_registration_runtime';runtimeUrl.password=password;
const pool=new pg.Pool({connectionString:runtimeUrl.toString()});
const origin='https://registration.example.test';let clock=Date.now();const handle=createRegistrationApi({pool,origin,secret:randomBytes(32).toString('hex'),now:()=>clock});
const address='192.0.2.'+Math.floor(Math.random()*200+1),email=randomUUID()+'@example.test';
const data={fullName:'Seller Sintetis',email,whatsapp:'',storeName:'Toko Sintetis',category:'Fashion',domain:'',noDomain:true,city:'',description:'',consent:true,consentVersion:CONSENT_VERSION,website:''};
const before=Number((await owner.query('SELECT count(*) FROM registration.entries')).rows[0].count);
const accountBefore=await owner.query("SELECT to_regclass('installer.sellers') AS table_name");
const sellerCount=accountBefore.rows[0].table_name?Number((await owner.query('SELECT count(*) FROM installer.sellers')).rows[0].count):null;
async function challenge(ip=address){const r=await handle(new Request(origin+'/api/registration/challenge'),{clientAddress:ip});assert.equal(r.status,200);const j=await r.json();clock+=2000;return j.challenge;}
function post(payload,id=randomUUID(),ip=address,extra={}){return handle(new Request(origin+'/api/registration',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','Idempotency-Key':id,...extra},body:JSON.stringify(payload)}),{clientAddress:ip});}
try{
  const proof=await challenge(),key=randomUUID();const results=await Promise.all(Array.from({length:8},()=>post({...data,challenge:proof},key)));
  assert.equal(results.filter(r=>r.status===201).length,1);assert(results.every(r=>[200,201].includes(r.status)));
  const receipts=await Promise.all(results.map(r=>r.json()));assert.equal(new Set(receipts.map(r=>r.referenceCode)).size,1);assert(!JSON.stringify(receipts).includes(email));
  assert.equal(Number((await owner.query('SELECT count(*) FROM registration.entries')).rows[0].count),before+1);
  assert.equal((await post({...data,storeName:'Changed',challenge:proof},key)).status,409);
  assert.equal((await post({...data,challenge:proof})).status,409);
  assert.equal((await post({...data,consent:false,challenge:proof})).status,422);
  assert.equal((await post({...data,challenge:proof},randomUUID(),address,{Origin:'https://evil.example'})).status,403);
  assert.equal((await post({...data,challenge:proof},randomUUID(),'198.51.100.8')).status,400);
  assert.equal((await handle(new Request(origin+'/api/registration'),{clientAddress:address})).status,404);
  for(let i=0;i<2;i++)assert.equal((await post({...data,challenge:await challenge()})).status,201);
  assert.equal((await post({...data,challenge:await challenge()})).status,429);
  const stored=(await owner.query('SELECT status,consent_version,consent_at FROM registration.entries WHERE email=$1',[email])).rows;
  assert(stored.every(r=>r.status==='REGISTERED'&&r.consent_version===CONSENT_VERSION&&r.consent_at));
  if(sellerCount!==null)assert.equal(Number((await owner.query('SELECT count(*) FROM installer.sellers')).rows[0].count),sellerCount);
  await assert.rejects(pool.query('CREATE TABLE registration.unauthorized(id integer)'),/permission denied/);
  await assert.rejects(pool.query('DELETE FROM registration.entries'),/permission denied/);
  if(sellerCount!==null)await assert.rejects(pool.query('SELECT * FROM installer.sellers'),/permission denied/);
  const expired=await challenge('198.51.100.9');clock+=1800001;assert.equal((await post({...data,challenge:expired},randomUUID(),'198.51.100.9')).status,400);
  console.log(JSON.stringify({result:'PASS',database:'isolated synthetic fixture',concurrentSubmissions:8,rowsForSingleKey:1,consent:true,noAccountCreation:true,runtimeCannotDDL:true,replayRejected:true,rateLimit:true}));
}finally{await pool.end();await owner.end();}
