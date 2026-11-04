// Offline staging only. Never uploads, activates a catalog or distributes root custody.
import {openSync,fstatSync,readFileSync,writeFileSync,closeSync,createReadStream,mkdirSync,copyFileSync,chmodSync,lstatSync,constants} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const sha=async file=>{const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex');};
function protectedFile(file,max,privateMode=false){if(!file||resolve(file)!==file)throw Error('Absolute protected file required');const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);try{const st=fstatSync(fd);if(!st.isFile()||st.size<1||st.size>max||(process.platform!=='win32'&&(st.mode&(privateMode?0o077:0o022))))throw Error('Protected file required');return readFileSync(fd);}finally{closeSync(fd)}}
const plan=JSON.parse(protectedFile(process.argv[2],65536,true));
const origin=new URL(plan.control_origin);if(origin.protocol!=='https:'||origin.origin!==plan.control_origin||origin.username||origin.password)throw Error('Canonical HTTPS origin required');
const receipt=JSON.parse(protectedFile(plan.receipt_file,65536,true));
const policyBytes=protectedFile(plan.policy_file,65536),policy=JSON.parse(policyBytes);
const keyless=policy.version===2&&policy.trust?.Mode==='keyless-v2';
const authority=keyless?createHash('sha256').update(JSON.stringify(['keyless-v2',policy.trust.SignerIssuer,policy.trust.SignerIdentity,policy.trust.Registry,policy.trust.RepositoryPrefix,policy.trust.Channel])).digest('hex'):null;
if(receipt.status!=='VERIFIED'||!/^rel-[0-9]+\.[0-9]+\.[0-9]+(?:-rc\.[0-9]+)?-(internal|pilot|stable)$/.test(receipt.release_id)||Date.parse(receipt.expires_at)<=Date.now()||policy.artifact_origin!==plan.control_origin)throw Error('Receipt/delivery mismatch');
if(keyless?(receipt.trust_mode!=='keyless-v2'||receipt.authority_sha256!==authority||receipt.source_sha!==policy.trust.ExpectedSourceSHA||receipt.root_sha256!==''||receipt.trust_state?.manifest_sha256!==receipt.manifest_sha256):receipt.root_sha256!==policy.trust?.BootstrapRootSHA256)throw Error('Receipt signing authority mismatch');
const setup=protectedFile(plan.installer_file,64*1024**2),signature=protectedFile(plan.installer_signature_file,4*1024**2);
protectedFile(policy.verifier_path,256*1024**2);if(await sha(policy.verifier_path)!==policy.verifier_sha256)throw Error('Independent verifier pin mismatch');
execFileSync(policy.verifier_path,['verify-blob','--offline','--bundle',plan.installer_signature_file,'--certificate-identity',policy.trust.SignerIdentity,'--certificate-oidc-issuer',policy.trust.SignerIssuer,plan.installer_file],{stdio:'pipe',timeout:60000});
let policySignature,policySignatureSHA;
if(keyless){policySignature=protectedFile(plan.policy_signature_file,4*1024**2);execFileSync(policy.verifier_path,['verify-blob','--offline','--bundle',plan.policy_signature_file,'--certificate-identity',policy.trust.SignerIdentity,'--certificate-oidc-issuer',policy.trust.SignerIssuer,plan.policy_file],{stdio:'pipe',timeout:60000});policySignatureSHA=createHash('sha256').update(policySignature).digest('hex');}
const info=lstatSync(plan.bundle_file);if(!info.isFile()||info.isSymbolicLink()||info.size<1||info.size>2*1024**3)throw Error('Bounded ZIP required');
const signatureSHA=createHash('sha256').update(signature).digest('hex');
const setupSHA=createHash('sha256').update(setup).digest('hex'),bundleSHA=await sha(plan.bundle_file),policySHA=createHash('sha256').update(policyBytes).digest('hex');
if(receipt.bundle_sha256!==bundleSHA||receipt.bundle_bytes!==info.size)throw Error('ZIP not bound to archive verification receipt');
if(!/^[a-f0-9]{64}$/.test(receipt.manifest_sha256)||!Number.isFinite(Date.parse(receipt.expires_at)))throw Error('Invalid receipt');
// Receipt must come from verify-release-archive, binding this exact ZIP.
// Remote round-trip verification is still required before activation.
if(resolve(plan.output_directory)!==plan.output_directory)throw Error('Fresh absolute output required');mkdirSync(plan.output_directory,{mode:0o700});
for(const [name,bytes] of [[setupSHA+'.setup',setup],[signatureSHA+'.sigstore.json',signature],[policySHA+'.policy.json',policyBytes]])writeFileSync(join(plan.output_directory,name),bytes,{mode:0o600,flag:'wx'});
if(keyless)writeFileSync(join(plan.output_directory,policySignatureSHA+'.sigstore.json'),policySignature,{mode:0o600,flag:'wx'});
copyFileSync(plan.bundle_file,join(plan.output_directory,bundleSHA+'.zip'),constants.COPYFILE_EXCL);chmodSync(join(plan.output_directory,bundleSHA+'.zip'),0o600);
const base=plan.control_origin+'/bootstrap/'+setupSHA;
const catalog={version:keyless?2:1,...(keyless?{trust_mode:'keyless-v2',authority_sha256:authority,source_sha:receipt.source_sha,policy_signature_sha256:policySignatureSHA,policy_signature_url:plan.control_origin+'/bootstrap/'+policySignatureSHA+'/policy-signature.json'}:{root_sha256:receipt.root_sha256}),release_id:receipt.release_id,expires_at:receipt.expires_at,manifest_sha256:receipt.manifest_sha256,policy_sha256:policySHA,policy_url:plan.control_origin+'/bootstrap/'+policySHA+'/policy.json',installer:{url:base+'/jetseller-setup',sha256:setupSHA,signature_url:plan.control_origin+'/bootstrap/'+signatureSHA+'/signature.json',signature_sha256:signatureSHA},release_bundle:{delivery:'scoped',sha256:bundleSHA,bytes:info.size},verification_receipt:receipt};
writeFileSync(join(plan.output_directory,'catalog.private.json'),JSON.stringify(catalog,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(keyless?'Verified keyless publication staged; validate HTTPS delivery before activation':'Legacy TUF publication staged; initial root pin remains independent');
