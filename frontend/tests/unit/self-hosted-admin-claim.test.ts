import {describe,it,expect} from 'vitest';
import {validateLocalAdminInput,localSetupConfig} from '@/lib/self-hosted/admin-claim';
import {readSetupInput,assertLocalSetupRequest} from '@/lib/self-hosted/admin-claim-http';
const valid=()=>({claim:'a'.repeat(43),name:'Owner',email:'owner@example.test',password:'synthetic-password-only'});
describe('local first administrator claim boundaries',()=>{
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
