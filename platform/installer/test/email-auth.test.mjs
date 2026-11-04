import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair } from 'jose';
import { createEmailAuthHandler, validateEmailAuth } from '../src/email-auth.mjs';
const origin='https://portal.fixture.example';
test('email OTP is default fail-closed without configuration and exposes no provider secrets',async()=>{
  const handler=createEmailAuthHandler({pool:{},controlOrigin:origin});
  const status=await handler(new Request(origin+'/auth/status',{headers:{origin:'https://buattokosendiri.web.id'}}));
  assert.equal(status.headers.get('access-control-allow-origin'),'https://buattokosendiri.web.id');
  assert.equal(status.headers.get('access-control-allow-credentials'),null);
  assert.deepEqual(await status.json(),{configured:false,method:'email_otp',registration_url:null,login_url:null,logout_url:'/api/installer/v1/session/logout',logout_scope:'local_portal_session'});
  assert.equal((await handler(new Request(origin+'/auth/email/start',{method:'POST'}))).status,503);
  assert.equal((await handler(new Request(origin+'/auth/status?redirect=evil'))).status,400);
  assert.equal((await handler(new Request(origin+'/auth/login'))).status,404);
});
test('email OTP requires private bounded configuration and refuses production delivery doubles',async()=>{
  const {privateKey}=await generateKeyPair('EdDSA',{crv:'Ed25519'});
  const config={resendApiKey:'synthetic-resend-key',otpPepper:'a'.repeat(64),from:'Buat Toko Online Sendiri <noreply@fixture.example>',sessionSigningKey:privateKey};
  for(const patch of [{otpPepper:'weak'},{resendApiKey:'missing'},{from:'bad\n@fixture.example'},{sessionSigningKey:null}])assert.throws(()=>validateEmailAuth({...config,...patch}));
  assert.throws(()=>createEmailAuthHandler({pool:{},controlOrigin:origin,config,fetchImpl:async()=>new Response('{}')}));
  const handler=createEmailAuthHandler({pool:{},controlOrigin:origin,config});
  const denied=await handler(new Request(origin+'/auth/email/start',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:'{}'}));
  assert.equal(denied.status,403);
});
