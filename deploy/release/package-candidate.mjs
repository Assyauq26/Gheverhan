// Assemble bounded ZIP data AFTER independent VerifyPackage receipt. Never signs roots.
import {readFileSync,readdirSync,lstatSync,openSync,closeSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const [directory,receiptFile,output]=process.argv.slice(2);
if(!directory||!receiptFile||!output)throw Error('verified metadata directory, private receipt, fresh output required');
const root=resolve(directory),receipt=JSON.parse(readFileSync(receiptFile,'utf8'));
if(receipt.status!=='VERIFIED'||Date.parse(receipt.expires_at)<=Date.now())throw Error('valid receipt required');
const channel=receipt.release_id.match(/-(internal|pilot|stable)$/)?.[1];if(!channel)throw Error('invalid channel');
const manifestBytes=readFileSync(root+'/channels/'+channel+'/release.json');
if(createHash('sha256').update(manifestBytes).digest('hex')!==receipt.manifest_sha256)throw Error('receipt mismatch');
const envelope=JSON.parse(manifestBytes),keyless=receipt.trust_mode==='keyless-v2';
if(keyless?(envelope.schema_version!=='btos-keyless-release/v2'||!receipt.authority_sha256||receipt.root_sha256!==''||receipt.source_sha!==envelope.source_sha):createHash('sha256').update(readFileSync(root+'/root.json')).digest('hex')!==receipt.root_sha256)throw Error('trust receipt mismatch');
const m=keyless?envelope.manifest:envelope;if(m.release_id!==receipt.release_id)throw Error('release mismatch');
const rootUpdates=readdirSync(root).filter(n=>/^[1-9][0-9]{0,3}\.root\.json$/.test(n)).sort((a,b)=>parseInt(a)-parseInt(b));if(rootUpdates.length>64)throw Error('bounded root chain required');
const files=[...(keyless?['channels/'+channel+'/release.sigstore.json']:[...rootUpdates,'root.json','timestamp.json','snapshot.json','targets.json']),'channels/'+channel+'/release.json',m.image_archive_target,m.image_bundle_target,m.migration_archive_target,m.migration_bundle_target];
for(const file of files){if(typeof file!=='string'||!/^([1-9][0-9]{0,3}\.root\.json|root.json|timestamp.json|snapshot.json|targets.json|channels\/(internal|pilot|stable)\/release(?:\.sigstore)?\.json|artifacts\/[A-Za-z0-9][A-Za-z0-9._-]{0,120})$/.test(file)||file.includes('..'))throw Error('invalid file');const st=lstatSync(root+'/'+file);if(!st.isFile()||st.isSymbolicLink())throw Error('regular file required');}
// ZIP tool receives fixed literal arguments; output must be new and outside payload.
const final=resolve(output);if(final.startsWith(root+'/'))throw Error('output outside payload required');
const fd=openSync(final,'wx',0o600);
try{execFileSync('zip',['-q','-X','-',...files],{cwd:root,stdio:['ignore',fd,'pipe']});}catch{throw Error('package refused; preserve source artifacts');}finally{closeSync(fd);}
console.log('Candidate ZIP prepared; verify by installer extraction and signature checks before upload');
