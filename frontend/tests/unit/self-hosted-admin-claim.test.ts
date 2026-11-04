import {describe,it,expect,vi,afterEach} from 'vitest';
import {validateLocalAdminInput,localSetupConfig} from '@/lib/self-hosted/admin-claim';
import {readSetupInput,assertLocalSetupRequest} from '@/lib/self-hosted/admin-claim-http';
const valid=()=>({claim:'a'.repeat(43),name:'Owner',email:'owner@example.test',password:'synthetic-password-only'});
describe('local first administrator claim boundaries',()=>{
  afterEach(()=>vi.unstubAllEnvs());
  it('requires canonical HTTPS, no query secret and an explicit same-origin POST',()=>{
    const id='550e8400-e29b-41d4-a716-446655440000', database='js_'+id.replaceAll('-','');
    const env={JETSELLER_STORE_PROFILE:'self-hosted',JETSELLER_INSTALLATION_MODE:'new',JETSELLER_INSTALLATION_ID:id,JETSELLER_STORE_DOMAIN:'store.example',APP_ORIGIN:'https://store.example',STORAGE_PROVIDER:'local',STORAGE_APP_NAME:'js_fixture',STORAGE_LOCAL_ROOT:'/var/lib/jetseller/media',DATABASE_URL:`postgresql://js_runtime:fixture-runtime@db:5432/${database}?schema=public`,JETSELLER_MIGRATION_IDENTITY:'js_migrate',JWT_SECRET:'a'.repeat(64),AUTH_COOKIE_NAME:'js_550e8400_session',PASSWORD_RESET_FROM:'Store <noreply@store.example>',PASSWORD_RESET_BASE_URL:'https://store.example'};
    for(const [key,value] of Object.entries(env))vi.stubEnv(key,value);
    expect(assertLocalSetupRequest(new Request('https://store.example/admin/setup'),false).installationId).toBe(id);
    expect(assertLocalSetupRequest(new Request('https://0.0.0.0:3000/admin/setup',{headers:{host:'store.example','x-forwarded-proto':'https'}}),false).installationId).toBe(id);
    expect(()=>assertLocalSetupRequest(new Request('https://0.0.0.0:3000/admin/setup',{headers:{host:'attacker.example','x-forwarded-proto':'https'}}),false)).toThrow('HTTPS_REQUIRED');
    expect(()=>assertLocalSetupRequest(new Request('http://0.0.0.0:3000/admin/setup',{headers:{host:'store.example','x-forwarded-proto':'http'}}),false)).toThrow('HTTPS_REQUIRED');
    expect(()=>assertLocalSetupRequest(new Request('https://0.0.0.0:3000/admin/setup',{headers:{host:'store.example','x-forwarded-proto':'https,http'}}),false)).toThrow('HTTPS_REQUIRED');

    expect(()=>assertLocalSetupRequest(new Request('http://store.example/admin/setup'),false)).toThrow('HTTPS_REQUIRED');
    expect(()=>assertLocalSetupRequest(new Request('https://attacker.example/admin/setup'),false)).toThrow('HTTPS_REQUIRED');
    expect(()=>assertLocalSetupRequest(new Request('https://store.example/admin/setup?claim=forbidden'),false)).toThrow('HTTPS_REQUIRED');
    expect(()=>assertLocalSetupRequest(new Request('https://store.example/admin/setup',{method:'POST'}),true)).toThrow('ORIGIN_DENIED');
    expect(()=>assertLocalSetupRequest(new Request('https://store.example/admin/setup',{method:'POST',headers:{origin:'https://attacker.example'}}),true)).toThrow('ORIGIN_DENIED');
    expect(assertLocalSetupRequest(new Request('https://store.example/admin/setup',{method:'POST',headers:{origin:'https://store.example'}}),true).domain).toBe('store.example');
  });
  it('rejects legacy and incomplete self-hosted profiles',()=>{
    expect(()=>localSetupConfig({})).toThrow('NOT_FOUND');
    expect(()=>localSetupConfig({JETSELLER_STORE_PROFILE:'self-hosted'})).toThrow('SETUP_UNAVAILABLE');
  });
  it('accepts only bounded expected fields without returning hashes',()=>{
    expect(validateLocalAdminInput(valid())).toEqual(valid());
    for(const input of [null,[],{}, {...valid(),installationId:'foreign'}, {...valid(),claim:'short'}, {...valid(),name:' x'}, {...valid(),email:'invalid'}, {...valid(),password:'short'}, {...valid(),password:'ü'.repeat(37)}])expect(()=>validateLocalAdminInput(input)).toThrow('INVALID_REQUEST');
  });
  it('times out and cancels a stalled streaming form without consuming a claim',async()=>{
    let cancelled=false;
    const body=new ReadableStream<Uint8Array>({cancel(){cancelled=true;}});
    const request=new Request('https://store.example/admin/setup',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body,duplex:'half'} as RequestInit & {duplex:'half'});
    const started=Date.now();
    await expect(readSetupInput(request,25)).rejects.toThrow('BODY_TIMEOUT');
    expect(cancelled).toBe(true); expect(Date.now()-started).toBeLessThan(2000);
  });
  it('parses form bodies and refuses duplicates, oversized bodies and password mismatch',async()=>{
    const request=(body:string,contentType='application/x-www-form-urlencoded')=>new Request('https://store.example/admin/setup',{method:'POST',headers:{'content-type':contentType},body});
    const body=new URLSearchParams({...valid(),confirmation:valid().password}).toString();
    expect(await readSetupInput(request(body))).toEqual(valid());
    await expect(readSetupInput(request(body+'&claim=duplicate'))).rejects.toThrow('INVALID_REQUEST');
    await expect(readSetupInput(request(body.replace('confirmation=synthetic-password-only','confirmation=different')))).rejects.toThrow('INVALID_REQUEST');
    await expect(readSetupInput(request('x'.repeat(4097)))).rejects.toThrow('INVALID_REQUEST');
    await expect(readSetupInput(request('{}','application/json'))).rejects.toThrow('INVALID_REQUEST');
  });
});
