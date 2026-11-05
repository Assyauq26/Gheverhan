import {fail,projectFor,uuid} from './common.mjs';
export class HarborProvider {
 #authorization;
 constructor({origin,username,password,robotPrefix='robot$',fetcher=fetch}){
  const u=new URL(origin);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash||typeof username!=='string'||!username||typeof password!=='string'||password.length<16||!/^[-A-Za-z0-9_$]{1,32}$/.test(robotPrefix))throw new Error('Invalid private registry operator configuration');
  this.origin=u.origin;this.robotPrefix=robotPrefix;this.fetcher=fetcher;this.#authorization='Basic '+Buffer.from(username+':'+password).toString('base64');
 }
 async api(method,path,body,allowed=[200]){
  let r;try{r=await this.fetcher(this.origin+'/api/v2.0'+path,{method,redirect:'error',signal:AbortSignal.timeout(8000),headers:{authorization:this.#authorization,'content-type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})});}catch{fail('REGISTRY_UNAVAILABLE');}
  if(!allowed.includes(r.status)){if(r.body)await r.body.cancel();fail(r.status===409?'REGISTRY_CONFLICT':'REGISTRY_UNAVAILABLE');}
  if(r.status===204||r.status===201&&r.headers.get('content-length')==='0')return null;
  const reader=r.body?.getReader();if(!reader)return null;const chunks=[];let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>262144){await reader.cancel();fail('REGISTRY_RESPONSE_INVALID');}chunks.push(Buffer.from(value));}const raw=Buffer.concat(chunks).toString();return raw?JSON.parse(raw):null;}catch{fail('REGISTRY_RESPONSE_INVALID');}
 }
 scope(robot,project){
  if(!robot||!Number.isSafeInteger(robot.id)||robot.id<1||robot.level!=='project'||!Array.isArray(robot.permissions)||robot.permissions.length!==1)fail('REGISTRY_SCOPE_MISMATCH');
  const p=robot.permissions[0];if(p.kind!=='project'||p.namespace!==project||p.access?.length!==1||p.access[0].resource!=='repository'||p.access[0].action!=='pull'||(p.access[0].effect&&p.access[0].effect!=='allow'))fail('REGISTRY_SCOPE_MISMATCH');
 }
 async find(installationId,grantId){const project=projectFor(installationId),name=this.robotPrefix+project+'+js-'+uuid(grantId).replaceAll('-','');const info=await this.api('GET','/projects/'+project);if(!Number.isSafeInteger(info?.project_id)||info.project_id<1||String(info.metadata?.public)!=='false')fail('REGISTRY_PROJECT_NOT_PRIVATE');const rows=await this.api('GET','/robots?'+new URLSearchParams({q:'Level=project,ProjectID='+info.project_id+',Name='+name.slice(this.robotPrefix.length),page_size:'100'}));if(!Array.isArray(rows))fail('REGISTRY_RESPONSE_INVALID');const found=rows.filter(x=>x.name===name);if(found.length>1)fail('REGISTRY_RESPONSE_INVALID');if(!found.length)return null;this.scope(found[0],project);return found[0];}
 async ensure({installationId,grantId,secret}){
  if(typeof secret!=='string'||!/^[A-Za-z0-9_-]{64}$/.test(secret)||!/[A-Z]/.test(secret)||!/[a-z]/.test(secret)||!/[0-9]/.test(secret))fail('GRANT_SECRET_UNAVAILABLE');
  const policy=await this.api('GET','/configurations');if(policy?.token_expiration?.value!==1)fail('REGISTRY_REVOCATION_BOUND_UNPROVEN');
  const project=projectFor(installationId),name='js-'+uuid(grantId).replaceAll('-','');const projectInfo=await this.api('GET','/projects/'+project);if(String(projectInfo?.metadata?.public)!=='false')fail('REGISTRY_PROJECT_NOT_PRIVATE');let robot=await this.find(installationId,grantId);
  if(!robot){try{await this.api('POST','/robots',{name,level:'project',duration:1,description:'JetSeller installation pull grant '+grantId,permissions:[{kind:'project',namespace:project,access:[{resource:'repository',action:'pull',effect:'allow'}]}]},[201]);}catch(e){if(e.code!=='REGISTRY_CONFLICT')throw e;}robot=await this.find(installationId,grantId);}
  if(!robot||!Number.isSafeInteger(robot.expires_at)||robot.disable||robot.expires_at*1000<=Date.now()||robot.expires_at*1000>Date.now()+86460000)fail('REGISTRY_GRANT_INVALID');
  // Harbor ignores supplied create-secret. Persist the chosen secret BEFORE this
  // idempotent PATCH; a lost creation/reply is reconciled by deterministic name.
  const refreshed=await this.api('PATCH','/robots/'+robot.id,{secret});if(refreshed?.secret!==undefined&&refreshed.secret!==''&&refreshed.secret!==secret)fail('REGISTRY_RESPONSE_INVALID');
  return {robotId:robot.id,username:robot.name,expiresAt:new Date(robot.expires_at*1000)};
 }
 async disable({installationId,grantId}){const robot=await this.find(installationId,grantId);if(!robot)return false;if(robot.disable)return true;await this.api('PUT','/robots/'+robot.id,{name:robot.name,level:'project',duration:robot.duration,description:robot.description,disable:true,permissions:robot.permissions});return true;}
}
