import {createServer} from 'node:http';
import {readFileSync,lstatSync} from 'node:fs';
import {timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {createRegistrationApi} from './api.mjs';

export function createRegistrationServer({pool,origin,secret,proxyToken}){
  const handler=createRegistrationApi({pool,origin,secret});
  const server=createServer(async(req,res)=>{
    const send=(status,data)=>res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify(data));
    try{
      if(req.url==='/healthz'&&req.method==='GET'){
        await pool.query('SELECT e.consent_version,r.payload_hash,l.expires_at,c.nonce_hash FROM registration.entries e,registration.requests r,registration.rate_limits l,registration.challenges c LIMIT 0');return send(200,{status:'ready'});
      }
      const token=req.headers['x-btos-registration-proxy'];
      if(typeof token!=='string'||Buffer.byteLength(token)!==Buffer.byteLength(proxyToken)||!timingSafeEqual(Buffer.from(token),Buffer.from(proxyToken)))return send(403,{error:'PROXY_REQUIRED'});
      const ip=req.headers['x-btos-client-ip'];if(typeof ip!=='string'||!isIP(ip))return send(403,{error:'PROXY_REQUIRED'});
      if(req.headers.host!==new URL(origin).host)return send(421,{error:'HOST_DENIED'});
      const chunks=[];let size=0;
      for await(const part of req){size+=part.length;if(size>8192){send(413,{error:'REQUEST_TOO_LARGE'});req.resume();return;}chunks.push(part);}
      const headers=new Headers();for(const name of ['origin','content-type','idempotency-key','sec-fetch-site'])if(typeof req.headers[name]==='string')headers.set(name,req.headers[name]);
      const method=req.method??'GET';const response=await handler(new Request(new URL(req.url,origin),{method,headers,...(!['GET','HEAD'].includes(method)?{body:Buffer.concat(chunks)}:{})}),{clientAddress:ip});
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
    }catch{if(!res.headersSent)send(503,{error:'REGISTRATION_UNAVAILABLE'});else res.destroy();}
  });
  server.requestTimeout=10000;server.headersTimeout=10000;server.maxRequestsPerSocket=100;server.maxConnections=80;
  return server;
}
function privateFile(file){const s=lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>4096||(process.platform!=='win32'&&(s.mode&0o077)))throw new Error('Private configuration required');return readFileSync(file,'utf8').trim();}
async function main(){
  const base='/run/secrets/';const origin='https://buattokosendiri.web.id';
  const url=privateFile(base+'database-url');const parsed=new URL(url);
  if(!['postgresql:','postgres:'].includes(parsed.protocol)||parsed.hostname!=='db'||parsed.pathname!=='/jetseller_control_plane'||parsed.username!=='btos_registration_runtime')throw new Error('Isolated platform runtime required');
  const secret=privateFile(base+'registration-secret'),proxyToken=privateFile(base+'proxy-token');
  if(!/^[a-f0-9]{64}$/.test(secret)||!/^[a-f0-9]{64}$/.test(proxyToken)||secret===proxyToken)throw new Error('Independent random secrets required');
  const pool=new pg.Pool({connectionString:url,max:5,statement_timeout:5000,connectionTimeoutMillis:5000});
  pool.on('error',()=>console.error('Registration database connection unavailable'));
  const server=createRegistrationServer({pool,origin,secret,proxyToken});
  server.listen(3200,'0.0.0.0',()=>console.log('Registration service listening'));
  const cleanup=setInterval(()=>{void pool.query('DELETE FROM registration.rate_limits WHERE expires_at < now()').catch(()=>{});void pool.query('DELETE FROM registration.challenges WHERE expires_at < now()').catch(()=>{});},3600000);cleanup.unref();
  const stop=()=>{clearInterval(cleanup);server.close(()=>void pool.end());};process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Registration startup refused');process.exitCode=1;});
