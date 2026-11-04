// Produces a NEW private proposal only. Never reloads/edits a running proxy.
import {openSync,fstatSync,readFileSync,closeSync,writeFileSync,constants} from 'node:fs';
import {isIP} from 'node:net';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
export function pilotCaddy(token,ips){
 if(!/^[a-f0-9]{64}$/.test(token)||!Array.isArray(ips)||ips.length<1||ips.length>8||ips.some(ip=>!isIP(ip)||['0.0.0.0','::','255.255.255.255'].includes(ip)))throw Error('Explicit pilot IPs and private admission credential required');
 return `dashboard.buattokosendiri.web.id {\n  @private path /healthz\n  respond @private 404\n  @pilot remote_ip ${ips.join(' ')}\n  handle @pilot {\n    reverse_proxy btos-control-api:3100 {\n      header_up X-Btos-Pilot-Token ${token}\n    }\n  }\n  handle {\n    respond "Temporarily unavailable" 503\n  }\n}\n`;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const [tokenFile,output,...ips]=process.argv.slice(2);
  if(!path.isAbsolute(tokenFile??'')||!path.isAbsolute(output??'')||output===tokenFile)throw Error('Absolute private file paths required');
  const fd=openSync(tokenFile,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  let token;
  try{const st=fstatSync(fd);if(!st.isFile()||st.size>65||(process.platform!=='win32'&&((st.mode&0o077)||![0,1000,process.getuid()].includes(st.uid))))throw Error('Private token file required');token=readFileSync(fd,'utf8').trim();}finally{closeSync(fd);}
  writeFileSync(output,pilotCaddy(token,ips),{flag:'wx',mode:0o600});
  console.log('Private pilot Caddy proposal written; no proxy action performed');
 }catch{console.error('Pilot proposal refused; no secret output');process.exitCode=1;}
}
