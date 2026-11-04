import {mkdirSync,writeFileSync,chmodSync,chownSync} from 'node:fs';
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
if(process.env.GITHUB_ACTIONS!=='true'||process.env.CONTROL_DISPOSABLE_FIXTURE!=='yes')throw Error('CI fixture only');
const root=resolve(process.argv[2]);
for(const dir of ['db','owner','runtime'])mkdirSync(root+'/'+dir,{recursive:true,mode:0o700});
const passwords=Object.fromEntries(['bootstrap','owner','runtime'].map(k=>[k,randomBytes(32).toString('hex')]));
const write=(dir,file,value,uid)=>{const p=root+'/'+dir+'/'+file;writeFileSync(p,value,{mode:0o400});chownSync(p,uid,uid);};
for(const role of ['bootstrap','owner','runtime'])write('db',role+'-password',passwords[role],999);
for(const [dir,role] of [['owner','owner'],['runtime','runtime']])write(dir,role==='owner'?'owner-database-url':'control-database-url',`postgresql://js_control_${role}:${passwords[role]}@db:5432/jetseller_control_plane`,1000);
const cfg=JSON.parse(await (await import('node:fs/promises')).readFile('platform/installer/config/buattokosendiri.example.json','utf8'));
cfg.releaseAccess={mode:'public'}; // Explicit isolated CI only, never production default.
write('runtime','control.json',JSON.stringify(cfg),1000);
for(const k of ['agent','session'])write('runtime',k+'-signing-key.pem',generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'}),1000);
write('runtime','otp-pepper',randomBytes(32).toString('hex'),1000);
write('runtime','resend-api-key','synthetic-key-not-used-for-delivery',1000);
for(const dir of ['owner','runtime']){chmodSync(root+'/'+dir,0o700);chownSync(root+'/'+dir,1000,1000);}
