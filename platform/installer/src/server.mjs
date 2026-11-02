import { createServer } from 'node:http';
import { createHandler } from './api.mjs';
import { createPool } from './db.mjs';
import { runtimeConfig } from './runtime.mjs';
import { createOidcHandler } from './oidc.mjs';
import { pathToFileURL } from 'node:url';

export function createControlServer(config,pool,{oidcFetch,dashboard}={}) {
  const handle=createHandler({pool,...config});
  const oidc=createOidcHandler({pool,controlOrigin:config.controlOrigin,config:config.oidc,...(oidcFetch?{fetchImpl:oidcFetch}:{})});
  const server=createServer(async (req,res)=>{
    try {
      if(dashboard && !req.url?.startsWith('/api/') && !req.url?.startsWith('/auth/') && dashboard(req,res))return;
      const chunks=[];let bytes=0;
      for await(const chunk of req){bytes+=chunk.length;if(bytes>16384){res.writeHead(413,{'Cache-Control':'no-store'}).end();req.destroy();return;}chunks.push(chunk);}
      const method=req.method??'GET';
      const headers=new Headers();
      // Do not trust forwarded identity, host or client-IP headers.
      for(const name of ['cookie','origin','x-csrf-token','idempotency-key','if-match','content-type','content-length','authorization','dpop']) {
        const value=req.headers[name];if(typeof value==='string')headers.set(name,value);
      }
      const request=new Request(new URL(req.url,config.controlOrigin),{method,headers,...(!['GET','HEAD'].includes(method)?{body:Buffer.concat(chunks)}:{})});
      const response=await (new URL(request.url).pathname.startsWith('/auth/')?oidc:handle)(request,{clientAddress:req.socket.remoteAddress??'unknown'});
      const responseHeaders=Object.fromEntries(response.headers);
      if(response.headers.getSetCookie().length)responseHeaders['set-cookie']=response.headers.getSetCookie();
      res.writeHead(response.status,responseHeaders);res.end(Buffer.from(await response.arrayBuffer()));
    }catch{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'}).end('{"error":{"code":"CONTROL_UNAVAILABLE"}}');}
  });
  server.requestTimeout=5000;server.headersTimeout=5000;server.maxRequestsPerSocket=100;
  return server;
}
async function main() {
  const config=await runtimeConfig(process.env.JETSELLER_CONTROL_CONFIG_FILE);
  const pool=createPool(config.databaseUrl);
  const version=await pool.query('SELECT version FROM installer.schema_version');
  if(version.rows.length!==1||version.rows[0].version!==1) throw new Error('Schema unavailable');
  const server=createControlServer(config,pool);
  server.listen(config.port,'127.0.0.1',()=>console.log('Installer control API listening on loopback; deployment approval remains required'));
  const stop=()=>server.close(()=>{void pool.end();});
  process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Installer control startup failed');process.exitCode=1;});
