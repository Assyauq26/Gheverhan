import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
export class DistributionError extends Error {constructor(code,status=503){super(code);this.name='DistributionError';this.code=code;this.status=status;}}
export const fail=(code,status)=>{throw new DistributionError(code,status)};
export function uuid(value){if(typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value))fail('INVALID_ID',400);return value;}
export const projectFor=id=>'js_'+uuid(id).replaceAll('-','');
export const hash=value=>createHash('sha256').update(value).digest('hex');
export function validateRelease(value,installationId){
 if(!value||value.signatureVerified!==true||value.project!==projectFor(installationId)||!['app','migration'].includes(value.repository)||!/^sha256:[a-f0-9]{64}$/.test(value.digest)||!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(value.version)||!Number.isFinite(Date.parse(value.metadataExpiresAt))||Date.parse(value.metadataExpiresAt)<=Date.now()||value.compatible!==true)fail('RELEASE_NOT_APPROVED',403);
 return {project:value.project,repository:value.repository,digest:value.digest,version:value.version,metadataExpiresAt:value.metadataExpiresAt};
}
export function secretBox(key){
 if(!Buffer.isBuffer(key)||key.length!==32)throw new Error('A separate 32-byte broker encryption key is required');
 return {seal(value,aad){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(aad));const data=Buffer.concat([c.update(value,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data]);},open(bytes,aad){try{const b=Buffer.from(bytes);if(b.length<29)throw Error();const c=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));c.setAAD(Buffer.from(aad));c.setAuthTag(b.subarray(12,28));return Buffer.concat([c.update(b.subarray(28)),c.final()]).toString('utf8');}catch{fail('GRANT_SECRET_UNAVAILABLE');}}};
}
