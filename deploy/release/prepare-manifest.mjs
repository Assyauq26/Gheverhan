import {readFileSync,writeFileSync} from 'node:fs';
const [template,candidate,output]=process.argv.slice(2);if(!template||!candidate||!output)throw Error('approved manifest template, build directory, fresh output required');
const m=JSON.parse(readFileSync(template,'utf8'));
const read=n=>readFileSync(candidate+'/'+n,'utf8').trim();
for(const [role,imageField,configField,archiveField,bundleField] of [['app','image','image_config_sha256','image_archive_target','image_bundle_target'],['migration','migration_image','migration_config_sha256','migration_archive_target','migration_bundle_target']]){
 const image=read(role+'-image'),config=read(role+'-config-digest');if(!/^[a-z0-9][a-z0-9.:/_-]+@sha256:[a-f0-9]{64}$/.test(image)||!/^sha256:[a-f0-9]{64}$/.test(config))throw Error('immutable image identity required');m[imageField]=image;m[configField]=config.slice(7);m[archiveField]='artifacts/'+role+'.tar.gz';m[bundleField]='artifacts/'+role+'.bundle.json';
}
writeFileSync(output,JSON.stringify(m,null,2)+'\n',{flag:'wx',mode:0o600});
