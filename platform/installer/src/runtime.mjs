import { lstat, readFile } from 'node:fs/promises';
import { importPKCS8 } from 'jose';
import { createPublicKey } from 'node:crypto';
import { exportJWK } from 'jose';
import { origin } from './common.mjs';

export async function privateFile(file) {
  const info=await lstat(file);
  if(!info.isFile()||info.isSymbolicLink()||info.size>65536||(process.platform!=='win32'&&(info.mode&0o077))) throw new Error('Private configuration required');
  return readFile(file,'utf8');
}
export async function runtimeConfig(file) {
  const value=JSON.parse(await privateFile(file));
  if(Object.keys(value).some(k=>!['controlOrigin','databaseUrlFile','signingKeyFile','sessionIssuer','oidc','port'].includes(k))) throw new Error('Invalid configuration');
  origin(value.controlOrigin);
  const port=value.port??3100;
  if(!Number.isInteger(port)||port<1024||port>65535) throw new Error('Invalid configuration');
  const databaseUrl=(await privateFile(value.databaseUrlFile)).trim();
  const signingPem=await privateFile(value.signingKeyFile);
  const signingKey=await importPKCS8(signingPem,'EdDSA');
  const verificationKey=createPublicKey(signingPem);
  let sessionIssuer;
  if(value.sessionIssuer) {
    const s=value.sessionIssuer;
    if(Object.keys(s).some(k=>!['issuer','audience','jwksFile'].includes(k))) throw new Error('Invalid configuration');
    sessionIssuer={issuer:s.issuer,audience:s.audience,jwks:JSON.parse(await privateFile(s.jwksFile))};
  }
  let oidc;
  if(value.oidc) {
    if(value.sessionIssuer)throw new Error('Select one portal identity configuration');
    const o=value.oidc;
    if(Object.keys(o).some(k=>!['issuer','clientId','authorizationEndpoint','tokenEndpoint','redirectUri','jwksFile','sessionSigningKeyFile'].includes(k)))throw new Error('Invalid OIDC configuration');
    const pem=await privateFile(o.sessionSigningKeyFile);
    if(pem==signingPem)throw new Error('Independent session signing key required');
    const sessionSigningKey=await importPKCS8(pem,'EdDSA');
    const sessionJwk=await exportJWK(createPublicKey(pem));
    sessionIssuer={issuer:value.controlOrigin,audience:'jetseller-portal',jwks:{keys:[sessionJwk]}};
    oidc={...o,jwks:JSON.parse(await privateFile(o.jwksFile)),sessionSigningKey};
  }
  return {controlOrigin:value.controlOrigin,databaseUrl,signingKey,verificationKey,sessionIssuer,oidc,port};
}
