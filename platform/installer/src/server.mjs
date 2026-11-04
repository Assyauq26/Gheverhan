import { createServer } from 'node:http';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createArtifactDelivery} from './artifact-delivery.mjs';
import { createInstallReleaseHandler } from './install-release.mjs';
import { createHandler } from './api.mjs';
import { createPool } from './db.mjs';
import { runtimeConfig } from './runtime.mjs';
import { createOidcHandler } from './oidc.mjs';
import { createEmailAuthHandler } from './email-auth.mjs';
import { pathToFileURL } from 'node:url';
import { serveDashboard } from '../../installer-web/dashboard.mjs';

export function createControlServer(config,pool,{oidcFetch,emailFetch,dashboard,domainLookup,installRelease}={}) {
  const delivery=config.artifactDirectory?createArtifactDelivery({pool,...config}):null;
  const releases=installRelease??createInstallReleaseHandler({pool,...config,issueDownloadGrant:delivery?.issue});
  const handle=createHandler({pool,...config,domainLookup,installRelease:releases});
  // Legacy OIDC remains available only when explicitly selected/configured.
  // Direct fixture callers may pass oidc; runtime defaults to email_otp.
  const auth=config.authMode==='oidc'||(!config.authMode&&config.oidc)?
    createOidcHandler({pool,controlOrigin:config.controlOrigin,config:config.oidc,...(oidcFetch?{fetchImpl:oidcFetch}:{})}):
    createEmailAuthHandler({pool,controlOrigin:config.controlOrigin,config:config.emailAuth,...(emailFetch?{fetchImpl:emailFetch}:{})});
  const server=createServer(async (req,res)=>{
    try {
      if(req.method==='GET' && req.url==='/healthz') {
        try {
          await pool.query('SELECT email_hash FROM installer.sellers LIMIT 0');
          await pool.query('SELECT authenticated_at FROM installer.sessions LIMIT 0');
          await pool.query('SELECT domain_verified_at FROM installer.installations LIMIT 0');
          if(config.artifactDirectory)await pool.query('SELECT token_hash FROM installer.download_grants LIMIT 0');
          res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end('{"status":"ready"}');
        } catch {res.writeHead(503,{'Cache-Control':'no-store'}).end();}
        return;
      }
      if(req.url?.startsWith('/bootstrap/')){
        const deadline=setTimeout(()=>res.destroy(),20*60*1000);
        try {
          const response=delivery?await delivery.handle(new Request(new URL(req.url,config.controlOrigin),{method:req.method})):new Response(null,{status:404});
          res.writeHead(response.status,Object.fromEntries(response.headers));
          if(response.body)await pipeline(Readable.fromWeb(response.body),res);else res.end();
        } finally {clearTimeout(deadline);}
        return;
      }
      if(dashboard && !req.url?.startsWith('/api/') && !req.url?.startsWith('/auth/') && await dashboard(req,res))return;
      const chunks=[];let bytes=0;
      for await(const chunk of req){bytes+=chunk.length;if(bytes>16384){res.writeHead(413,{'Cache-Control':'no-store'}).end();req.destroy();return;}chunks.push(chunk);}
      const method=req.method??'GET';
      const headers=new Headers();
      // Do not trust forwarded identity, host or client-IP headers.
      for(const name of ['cookie','origin','x-csrf-token','idempotency-key','if-match','content-type','content-length','authorization','dpop']) {
        const value=req.headers[name];if(typeof value==='string')headers.set(name,value);
      }
      const request=new Request(new URL(req.url,config.controlOrigin),{method,headers,...(!['GET','HEAD'].includes(method)?{body:Buffer.concat(chunks)}:{})});
      const response=await (new URL(request.url).pathname.startsWith('/auth/')?auth:handle)(request,{clientAddress:req.socket.remoteAddress??'unknown'});
      const responseHeaders=Object.fromEntries(response.headers);
      if(response.headers.getSetCookie().length)responseHeaders['set-cookie']=response.headers.getSetCookie();
      res.writeHead(response.status,responseHeaders);res.end(Buffer.from(await response.arrayBuffer()));
    }catch{if(res.headersSent){res.destroy();return;}res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'}).end('{"error":{"code":"CONTROL_UNAVAILABLE"}}');}
  });
  server.requestTimeout=5000;server.headersTimeout=5000;server.maxRequestsPerSocket=100;
  return server;
}
async function main() {
  const config=await runtimeConfig(process.env.JETSELLER_CONTROL_CONFIG_FILE);
  const pool=createPool(config.databaseUrl);
  const version=await pool.query('SELECT version FROM installer.schema_version');
  if(version.rows.length!==1||version.rows[0].version!==1) throw new Error('Schema unavailable');
  const server=createControlServer(config,pool,{dashboard:serveDashboard});
  server.listen(config.port,config.listenHost,()=>console.log('Installer control API listening; deployment approval remains required'));
  const stop=()=>server.close(()=>{void pool.end();});
  process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Installer control startup failed');process.exitCode=1;});
