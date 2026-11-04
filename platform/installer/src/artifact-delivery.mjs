import {open,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {Readable} from 'node:stream';
import path from 'node:path';
import {hash,opaque,fail} from './common.mjs';
import {transaction} from './db.mjs';
import {validateReleaseCatalog} from './install-release.mjs';
const maxBytes=2*1024**3;
const denied=()=>new Response(null,{status:404,headers:{'cache-control':'no-store','referrer-policy':'no-referrer'}});
async function directory(root) {
 if(!path.isAbsolute(root)||path.normalize(root)!==root)throw Error('Protected artifact directory required');
 let current=root;
 while(true){const st=await lstat(current);if(!st.isDirectory()||st.isSymbolicLink()||(process.platform!=='win32'&&(((st.mode&0o022)&&!(current!==root&&st.uid===0&&(st.mode&0o1000)))||![0,process.getuid()].includes(st.uid))))throw Error('Protected artifact directory required');const parent=path.dirname(current);if(parent===current)break;current=parent;}
}
/** A scoped capability grants ONE GET, not public access to a static archive. */
export function createArtifactDelivery({pool,controlOrigin,getCatalog,artifactDirectory,maxConcurrent=2}) {
 if(!Number.isInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>4)throw Error('Bounded delivery required');
 let active=0;
 const issue=async(client,{installationId,deviceId,manifestSHA256,catalog,expiresAt})=>{
  if(catalog.release_bundle.delivery!=='scoped'||!artifactDirectory)fail(503,'RELEASE_UNAVAILABLE');
  const recent=(await client.query("SELECT count(*)::integer AS n FROM installer.download_grants WHERE device_id=$1 AND created_at>now()-interval '1 minute'",[deviceId])).rows[0].n;
  if(recent>=5)fail(429,'RATE_LIMITED');
  const token=opaque(),expires=new Date(Math.min(Date.now()+120000,Date.parse(expiresAt)));
  if(!Number.isFinite(expires.getTime())||expires<=new Date())fail(503,'RELEASE_UNAVAILABLE');
  await client.query("DELETE FROM installer.download_grants WHERE expires_at<now()-interval '1 day'");
  await client.query('INSERT INTO installer.download_grants(token_hash,installation_id,device_id,manifest_sha256,bundle_sha256,expires_at) VALUES($1,$2,$3,$4,$5,$6)',[hash(token),installationId,deviceId,manifestSHA256,catalog.release_bundle.sha256,expires]);
  return controlOrigin+'/downloads/'+token;
 };
 const handle=async request=>{
  const u=new URL(request.url),bootstrap=u.pathname.startsWith('/bootstrap/');if(!u.pathname.startsWith('/downloads/')&&!bootstrap)return null;
  if(u.origin!==controlOrigin||request.method!=='GET'||u.search||u.hash||!(bootstrap?/^\/bootstrap\/[a-f0-9]{64}\/(jetseller-setup|signature.json|policy.json)$/.test(u.pathname):/^\/downloads\/[A-Za-z0-9_-]{43}$/.test(u.pathname)))return denied();
  if(active>=maxConcurrent)return new Response(null,{status:429,headers:{'retry-after':'5','cache-control':'no-store'}});
  active++;let file,stream,finished=false;
  const finish=()=>{if(!finished){finished=true;active--;}};
  try {
   const catalog=validateReleaseCatalog(await getCatalog());if(catalog.release_bundle.delivery!=='scoped')throw Error('Scoped delivery required');
   await directory(artifactDirectory);
   if(bootstrap){
    const [, ,sha,name]=u.pathname.split('/');if(sha!==catalog.installer.sha256)throw Error('Retired bootstrap');
    const spec={ 'jetseller-setup':['.setup','application/octet-stream',64*1024**2], 'signature.json':['.sigstore.json','application/json',4*1024**2], 'policy.json':['.policy.json','application/json',65536] }[name];
    file=await open(path.join(artifactDirectory,sha+spec[0]),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const st=await file.stat();if(!st.isFile()||st.size<1||st.size>spec[2]||(process.platform!=='win32'&&((st.mode&0o022)||![0,process.getuid()].includes(st.uid))))throw Error('Invalid bootstrap');
    stream=file.createReadStream({highWaterMark:65536,autoClose:true});file=undefined;stream.once('close',finish);stream.once('error',finish);
    return new Response(Readable.toWeb(stream),{headers:{'content-type':spec[1],'content-length':String(st.size),'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
   }
   file=await open(path.join(artifactDirectory,catalog.release_bundle.sha256+'.zip'),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
   const st=await file.stat();if(!st.isFile()||st.size!==catalog.release_bundle.bytes||st.size<1||st.size>maxBytes||(process.platform!=='win32'&&((st.mode&0o022)||![0,process.getuid()].includes(st.uid))))throw Error('Invalid artifact');
   const grant=await transaction(pool,async client=>{
    // Match unpair's installationâ†’device lock order; consume with a CAS so
    // concurrent GETs cannot share the capability even after an earlier read.
    const tokenHash=hash(u.pathname.slice('/downloads/'.length));
    const row=(await client.query('SELECT * FROM installer.download_grants WHERE token_hash=$1',[tokenHash])).rows[0];
    if(!row||row.manifest_sha256!==catalog.manifest_sha256||row.bundle_sha256!==catalog.release_bundle.sha256)fail(404,'NOT_FOUND');
    const installation=(await client.query("SELECT id FROM installer.installations WHERE id=$1 AND status='PAIRED' AND reserved_domain=domain AND claim_expires_at>now() FOR UPDATE",[row.installation_id])).rows[0];
    if(!installation)fail(404,'NOT_FOUND');
    const device=(await client.query('SELECT id FROM installer.devices WHERE id=$1 AND installation_id=$2 AND revoked_at IS NULL FOR UPDATE',[row.device_id,row.installation_id])).rows[0];
    if(!device)fail(404,'NOT_FOUND');
    const accepted=await client.query('UPDATE installer.download_grants SET consumed_at=now() WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING token_hash',[tokenHash]);
    if(!accepted.rowCount)fail(404,'NOT_FOUND');return row;
   });
   if(!grant)throw Error('Invalid grant');
   stream=file.createReadStream({start:0,end:st.size-1,highWaterMark:65536,autoClose:true});file=undefined;
   stream.once('close',finish);stream.once('error',finish);
   return new Response(Readable.toWeb(stream),{headers:{'content-type':'application/zip','content-length':String(st.size),'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-disposition':'attachment; filename="release.zip"'}});
  }catch{stream?.destroy();await file?.close();finish();return denied();}
 };
 return {issue,handle};
}
