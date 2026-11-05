import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function registrationCaddy(proxyToken){
  if(!/^[a-f0-9]{64}$/.test(proxyToken))throw new Error('Private proxy token required');
  return `buattokosendiri.web.id {
  encode zstd gzip
  header {
    X-Content-Type-Options nosniff
    Referrer-Policy strict-origin-when-cross-origin
    X-Frame-Options DENY
    Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    Cache-Control "no-cache"
  }
  route {
    @legacy path /daftar /daftar/ /masuk /masuk/ /mulai /mulai/ /toko /toko/*
    redir @legacy /pendaftaran 308
    @private path /healthz /auth/* /api/installer/* /bootstrap/* /portal-config.json /release-manifest.json
    respond @private 404
    @registration path /api/registration /api/registration/challenge
    reverse_proxy @registration btos-registration-api:3200 {
      header_up X-Btos-Registration-Proxy ${proxyToken}
      header_up X-Btos-Client-IP {http.request.remote.host}
    }
    @unknownApi path /api/*
    respond @unknownApi 404
    @form path /pendaftaran /pendaftaran/
    rewrite @form /pendaftaran/index.html
    @guide path /panduan /panduan/
    rewrite @guide /panduan/index.html
    @privacy path /kebijakan-privasi /kebijakan-privasi/
    rewrite @privacy /kebijakan-privasi/index.html
    root * /data/landing/jetseller
    file_server
  }
}
`;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{writeFileSync(process.argv[3],registrationCaddy(readFileSync(process.argv[2],'utf8').trim()),{mode:0o600,flag:'wx'});console.log('Private BTOS-only Caddy block written; not deployed');}catch{console.error('Caddy preparation refused');process.exitCode=1;}
}
