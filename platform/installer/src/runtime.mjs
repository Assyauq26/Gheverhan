import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { importPKCS8 } from 'jose';
import { createPublicKey } from 'node:crypto';
import { exportJWK } from 'jose';
import { origin } from './common.mjs';
import { validateEmailAuth } from './email-auth.mjs';
import {loadReleaseAccess} from './release-access.mjs';

function requireIndependentSessionKey(pem,agentPublicKey) {
  const publicBytes=key=>key.export({type:'spki',format:'der'});
  if(publicBytes(createPublicKey(pem)).equals(publicBytes(agentPublicKey)))throw Error('Independent session signing key required');
}

export async function privateFile(file) {
  if(typeof file!=='string'||!path.isAbsolute(file))throw new Error('Private configuration required');
  // Validate the opened descriptor, not a pathname that can be swapped between
  // lstat and readFile. Bounded reads also reject concurrent oversized files.
  const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try {
    const info=await handle.stat();
    if(!info.isFile()||info.size>65536||(process.platform!=='win32'&&((info.mode&0o077)||(info.uid!==process.getuid()&&info.uid!==0))))throw new Error('Private configuration required');
    const buffer=Buffer.alloc(65537);let offset=0;
    while(offset<buffer.length){const {bytesRead}=await handle.read(buffer,offset,buffer.length-offset,null);if(!bytesRead)break;offset+=bytesRead;}
    if(offset>65536)throw new Error('Private configuration required');
    return buffer.subarray(0,offset).toString('utf8');
  }finally{await handle.close();}
}
export async function runtimeConfig(file) {
  const value=JSON.parse(await privateFile(file));
  if(Object.keys(value).some(k=>!['releaseAccess','releaseCatalogFile','controlOrigin','databaseUrlFile','signingKeyFile','sessionIssuer','oidc','emailAuth','authMode','port','listenHost','artifactDirectory'].includes(k))) throw new Error('Invalid configuration');
  const releaseAccess=await loadReleaseAccess(value.releaseAccess,privateFile);
  origin(value.controlOrigin);
  if(value.artifactDirectory!==undefined&&(typeof value.artifactDirectory!=='string'||!path.isAbsolute(value.artifactDirectory)))throw Error('Absolute artifact directory required');
  const listenHost=value.listenHost??'127.0.0.1';
  if(!['127.0.0.1','0.0.0.0'].includes(listenHost))throw new Error('Invalid bind address');
  const port=value.port??3100;
  if(!Number.isInteger(port)||port<1024||port>65535) throw new Error('Invalid configuration');
  const databaseUrl=(await privateFile(value.databaseUrlFile)).trim();
  const signingPem=await privateFile(value.signingKeyFile);
  const signingKey=await importPKCS8(signingPem,'EdDSA');
  const verificationKey=createPublicKey(signingPem);
  const authMode=value.authMode??'email_otp';
  if(!['email_otp','oidc'].includes(authMode)||(authMode==='email_otp'&&(value.oidc||value.sessionIssuer))||(authMode==='oidc'&&value.emailAuth))throw new Error('Explicit single identity mode required');
  let sessionIssuer,emailAuth;
  if(value.emailAuth) {
    const e=value.emailAuth;
    if(Object.keys(e).some(k=>!['resendApiKeyFile','otpPepperFile','from','sessionSigningKeyFile'].includes(k)))throw new Error('Invalid email authentication configuration');
    const pem=await privateFile(e.sessionSigningKeyFile);
    requireIndependentSessionKey(pem,verificationKey);
    const sessionSigningKey=await importPKCS8(pem,'EdDSA'),sessionJwk=await exportJWK(createPublicKey(pem));
    emailAuth={resendApiKey:(await privateFile(e.resendApiKeyFile)).trim(),otpPepper:(await privateFile(e.otpPepperFile)).trim(),from:e.from,sessionSigningKey};
    validateEmailAuth(emailAuth);
    sessionIssuer={issuer:value.controlOrigin,audience:'jetseller-portal',jwks:{keys:[sessionJwk]}};
  }
  if(value.sessionIssuer) {
    const s=value.sessionIssuer;
    if(Object.keys(s).some(k=>!['issuer','audience','jwksFile'].includes(k))) throw new Error('Invalid configuration');
    sessionIssuer={issuer:s.issuer,audience:s.audience,jwks:JSON.parse(await privateFile(s.jwksFile))};
  }
  let oidc;
  if(value.oidc) {
    if(value.sessionIssuer)throw new Error('Select one portal identity configuration');
    const o=value.oidc;
    if(Object.keys(o).some(k=>!['issuer','clientId','authorizationEndpoint','registrationEndpoint','tokenEndpoint','tokenEndpointAuthMethod','clientSecretFile','redirectUri','jwksFile','sessionSigningKeyFile'].includes(k)))throw new Error('Invalid OIDC configuration');
    const pem=await privateFile(o.sessionSigningKeyFile);
    requireIndependentSessionKey(pem,verificationKey);
    const sessionSigningKey=await importPKCS8(pem,'EdDSA');
    const sessionJwk=await exportJWK(createPublicKey(pem));
    sessionIssuer={issuer:value.controlOrigin,audience:'jetseller-portal',jwks:{keys:[sessionJwk]}};
    const clientSecret=o.clientSecretFile?(await privateFile(o.clientSecretFile)).trim():undefined;
    oidc={...o,...(clientSecret!==undefined?{clientSecret}:{}),jwks:JSON.parse(await privateFile(o.jwksFile)),sessionSigningKey};
  }
  const getCatalog=value.releaseCatalogFile?async()=>{
    const c=JSON.parse(await privateFile(value.releaseCatalogFile));
    if(c.release_bundle?.delivery!=='scoped'||!value.artifactDirectory||!/^[a-f0-9]{64}$/.test(c.installer?.signature_sha256??''))throw Error('Scoped artifact delivery required');
    return c;
  }:async()=>null;
  return {releaseAccess,artifactDirectory:value.artifactDirectory,getCatalog,controlOrigin:value.controlOrigin,databaseUrl,signingKey,verificationKey,sessionIssuer,oidc,emailAuth,authMode,port,listenHost};
}
