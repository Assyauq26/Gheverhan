import {createHash,timingSafeEqual} from 'node:crypto';

const digest=value=>createHash('sha256').update(value).digest('hex');
// Deployment activation is independent from identity, device PoP and releases.
// Missing configuration keeps every onboarding/installer route closed.
export async function loadReleaseAccess(value,readPrivate) {
 const config=value??{mode:'closed'};
 if(!config||typeof config!=='object'||Array.isArray(config)||Object.keys(config).some(k=>!['mode','pilotTokenFile'].includes(k))||!['closed','pilot','public'].includes(config.mode))throw Error('Explicit release access mode required');
 if(config.mode!=='pilot'){
  if(config.pilotTokenFile!==undefined)throw Error('Pilot credential only valid in pilot mode');
  return {mode:config.mode};
 }
 const token=(await readPrivate(config.pilotTokenFile)).trim();
 if(!/^[a-f0-9]{64}$/.test(token))throw Error('Private pilot proxy credential required');
 return {mode:'pilot',tokenSHA256:digest(token)};
}
export function releaseRequestAllowed(access,headers) {
 const mode=access?.mode??'closed';
 if(mode==='public')return true;
 if(mode!=='pilot'||!/^[a-f0-9]{64}$/.test(access.tokenSHA256??''))return false;
 const token=headers['x-btos-pilot-token'];
 return typeof token==='string'&&/^[a-f0-9]{64}$/.test(token)&&timingSafeEqual(Buffer.from(digest(token),'hex'),Buffer.from(access.tokenSHA256,'hex'));
}
export function releaseUnavailable(req,res,mode) {
 if(req.method==='GET'&&req.url==='/auth/status'){
  const cors=req.headers.origin==='https://buattokosendiri.web.id'?{'Access-Control-Allow-Origin':'https://buattokosendiri.web.id'}:{};
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',...cors}).end(JSON.stringify({configured:false,method:'email_otp',registration_url:null,login_url:null,release_mode:mode??'closed'}));
 }else res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store','Retry-After':'60'}).end('{"error":{"code":"RELEASE_UNAVAILABLE"}}');
}
