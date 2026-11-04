import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK } from 'jose';
import { createOidcHandler, validateOidc } from '../src/oidc.mjs';
const controlOrigin='https://portal.fixture.example',issuer='https://identity.fixture.example';
async function config() {
  const provider=await generateKeyPair('EdDSA',{crv:'Ed25519'});
  const session=await generateKeyPair('EdDSA',{crv:'Ed25519'});
  return {issuer,clientId:'fixture-client',authorizationEndpoint:issuer+'/authorize',registrationEndpoint:issuer+'/register',
    tokenEndpoint:issuer+'/token',redirectUri:controlOrigin+'/auth/callback',jwks:{keys:[await exportJWK(provider.publicKey)]},sessionSigningKey:session.privateKey};
}
test('registration capability is explicit, fail-closed and public status is credential-free',async()=>{
  const pool={query:async()=>{throw Error('Unexpected database access');}};
  let handler=createOidcHandler({pool,controlOrigin});
  let response=await handler(new Request(controlOrigin+'/auth/status',{headers:{origin:'https://buattokosendiri.web.id'}}));
  assert.equal(response.headers.get('access-control-allow-origin'),'https://buattokosendiri.web.id');
  assert.equal(response.headers.get('access-control-allow-credentials'),null);
  assert.deepEqual(await response.json(),{configured:false,login_url:null,registration_url:null,logout_url:'/api/installer/v1/session/logout',logout_scope:'local_portal_session'});
  assert.equal((await handler(new Request(controlOrigin+'/auth/register'))).status,503);
  response=await handler(new Request(controlOrigin+'/auth/status',{headers:{origin:'https://evil.example'}}));
  assert.equal(response.headers.get('access-control-allow-origin'),null);
  assert.equal((await handler(new Request(controlOrigin+'/auth/status?redirect=https://evil.example'))).status,400);
  assert.equal((await handler(new Request(controlOrigin+'/auth/status',{method:'POST'}))).status,405);
});
test('provider-hosted registration receives full fresh PKCE/state/nonce flow and no arbitrary redirect',async()=>{
  const calls=[];
  const pool={query:async(sql,args)=>{calls.push({sql,args});return {rows:[{count:1}]};}};
  const value=await config();const handler=createOidcHandler({pool,controlOrigin,config:value});
  const login=await handler(new Request(controlOrigin+'/auth/login'));
  const register=await handler(new Request(controlOrigin+'/auth/register'));
  const signup=await handler(new Request(controlOrigin+'/auth/signup'));
  assert.equal(login.status,302);assert.equal(register.status,302);
  assert.equal(signup.status,302);assert.equal(new URL(signup.headers.get('location')).pathname,'/register');
  const a=new URL(login.headers.get('location')),b=new URL(register.headers.get('location'));
  assert.equal(b.origin+b.pathname,value.registrationEndpoint);
  assert.equal(a.origin+a.pathname,value.authorizationEndpoint);
  for(const url of [a,b]) {
    assert.equal(url.searchParams.get('response_type'),'code');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
    assert.equal(url.searchParams.get('scope'),'openid email');assert.equal(url.searchParams.get('redirect_uri'),value.redirectUri);
    for(const name of ['state','nonce','code_challenge'])assert.match(url.searchParams.get(name),/^[A-Za-z0-9_-]{43}$/);
  }
  assert.notEqual(a.searchParams.get('state'),b.searchParams.get('state'));
  assert.match(register.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Lax/);
  assert.equal(register.headers.get('access-control-allow-origin'),null);
  assert.equal((await handler(new Request(controlOrigin+'/auth/register?redirect=https://evil.example'))).status,400);
  const status=await (await handler(new Request(controlOrigin+'/auth/status'))).json();assert.equal(status.registration_url,'/auth/register');
  assert.ok(calls.some(call=>call.sql.startsWith('INSERT INTO installer.oidc_logins')));
  const withoutRegistration={...value};delete withoutRegistration.registrationEndpoint;
  assert.equal((await createOidcHandler({pool,controlOrigin,config:withoutRegistration})(new Request(controlOrigin+'/auth/register'))).status,503);
});
test('provider endpoints, client secrets and callback are pinned configuration only',async()=>{
  const value=await config();
  for(const patch of [{registrationEndpoint:'https://evil.example/register'},{registrationEndpoint:issuer+'/register?redirect=x'},
    {registrationEndpoint:'http://identity.fixture.example/register'},{registrationEndpoint:''},{redirectUri:controlOrigin+'/untrusted'},
    {tokenEndpointAuthMethod:'client_secret_post'},{clientSecret:'not-explicitly-enabled'},
    {tokenEndpointAuthMethod:'client_secret_basic'}])assert.throws(()=>validateOidc({...value,...patch},controlOrigin));
  assert.doesNotThrow(()=>validateOidc({...value,tokenEndpointAuthMethod:'none'},controlOrigin));
  assert.doesNotThrow(()=>validateOidc({...value,tokenEndpointAuthMethod:'client_secret_basic',clientSecret:'synthetic-client-credential'},controlOrigin));
});
