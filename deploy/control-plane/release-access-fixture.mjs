// Guarded CI fixture only. Does not accept an arbitrary host directory.
import {readFileSync,writeFileSync,chmodSync,chownSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {pilotCaddy} from './render-pilot-caddy.mjs';
if(process.env.GITHUB_ACTIONS!=='true'||process.env.CONTROL_DISPOSABLE_FIXTURE!=='yes')throw Error('Disposable CI only');
const root='/tmp/p0-control-fixture',file=root+'/runtime/control.json';
const action=process.argv[2];
if(['closed','pilot'].includes(action)){
 const config=JSON.parse(readFileSync(file,'utf8'));config.releaseAccess={mode:action};
 if(action==='pilot'){
  const token=randomBytes(32).toString('hex'),tokenFile=root+'/runtime/pilot-proxy-token';
  writeFileSync(tokenFile,token,{flag:'wx',mode:0o400});chownSync(tokenFile,1000,1000);
  config.releaseAccess.pilotTokenFile='/etc/buattokosendiri/pilot-proxy-token';
  writeFileSync(root+'/pilot.Caddyfile',pilotCaddy(token,['127.0.0.1']).replace('dashboard.buattokosendiri.web.id {','http://dashboard.buattokosendiri.web.id {'),{flag:'wx',mode:0o600});
  writeFileSync(root+'/pilot-adapted.json','',{flag:'wx',mode:0o600});
 }
 writeFileSync(file,JSON.stringify(config));
}else if(action==='proxy'){
 const adapted=JSON.parse(readFileSync(root+'/pilot-adapted.json','utf8'));
 const servers=Object.values(adapted.apps.http.servers);
 if(servers.length!==1||JSON.stringify(servers[0].listen)!=='[":80"]'||servers[0].routes.length!==1)throw Error('HTTP fixture scope required');
 const route=servers[0].routes[0];
 if(JSON.stringify(route.match)!=='[{"host":["dashboard.buattokosendiri.web.id"]}]')throw Error('Dashboard-only route required');
 const target='deploy/control-plane/coexist-fixture.json',original=JSON.parse(readFileSync(target,'utf8'));
 original.apps.http.servers.fixture.routes[0]=route;chmodSync(target,0o600);writeFileSync(target,JSON.stringify(original));
}else throw Error('Fixed fixture phase required');
