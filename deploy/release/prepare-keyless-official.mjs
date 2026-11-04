// Protected keyless publisher. No root ceremony, root keys or online TUF keys.
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {validatePublisherEnvironment} from './publisher-environment.mjs';
const env=process.env,dir='/tmp/btos-publication-input',repo='Assyauq26/Gheverhan';
const identity='https://github.com/'+repo+'/.github/workflows/btos-official-release.yml@refs/heads/main';
const issuer='https://token.actions.githubusercontent.com';
const verifierSHA='424e2c97d0b45fd7a6b608a87f090f35633f4c23ece5f092d48bba11aaf4bbfa';
if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REPOSITORY!==repo||env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_WORKFLOW_REF!==repo+'/.github/workflows/btos-official-release.yml@refs/heads/main')throw Error('Dedicated main workflow required');
if(!/^[a-f0-9]{40}$/.test(env.RELEASE_SOURCE_SHA??'')||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==env.RELEASE_SOURCE_SHA||env.GITHUB_SHA!==env.RELEASE_SOURCE_SHA)throw Error('Exact main source required');
const api=async route=>{const r=await fetch('https://api.github.com/repos/'+repo+route,{headers:{authorization:'Bearer '+env.GH_TOKEN,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'},redirect:'error'});if(!r.ok)throw Error('Approval metadata unavailable');return r.json();};
const protection=await api('/environments/btos-release-publisher');
const branches=protection.deployment_branch_policy?.custom_branch_policies?(await api('/environments/btos-release-publisher/deployment-branch-policies?per_page=100')).branch_policies:undefined;
validatePublisherEnvironment(protection,branches);
const checks=await api('/commits/'+env.RELEASE_SOURCE_SHA+'/check-runs?per_page=100');
for(const name of ['installer-tests','registry-tests','private-control-stack','metadata-and-package','full-synthetic-seller','unit-tests','dashboard-contracts','dashboard-browser-integration','cli-browser-pairing','privileged-boundaries','resource-vm','disposable-runtime','signed-fixture-provision','visual-regression','isolated-integration-browser','build-and-deploy']){
 const latest=checks.check_runs?.filter(c=>c.name===name&&c.head_sha===env.RELEASE_SOURCE_SHA&&c.app?.id===15368).sort((a,b)=>b.id-a.id)[0];
 if(!latest||latest.conclusion!=='success')throw Error('Exact-source GitHub Actions check not successful: '+name);
}
if(env.APPROVED_GHCR_PREFIX&&env.APPROVED_GHCR_PREFIX!=='ghcr.io/assyauq26/buattokosendiri')throw Error('Registry namespace mismatch');
if(env.REVIEWED_COSIGN_SHA256&&env.REVIEWED_COSIGN_SHA256!==verifierSHA)throw Error('Verifier pin mismatch');
const previous=JSON.parse(env.BTOS_PREVIOUS_STATE_JSON||'{}');
if(!previous.highest_release_sequence){
 const history=await api('/actions/workflows/btos-official-release.yml/runs?status=success&per_page=1');
 if(env.GENESIS_RELEASE!=='true'||history.total_count>0)throw Error('First publication approval or verified previous state required');
}else if(previous.trust_mode!=='keyless-v2'||!/^[a-f0-9]{64}$/.test(previous.authority_sha256??''))throw Error('Verified previous keyless state required');
const version=env.RELEASE_VERSION||'1.0.0',channel=env.RELEASE_CHANNEL||'stable';
if(!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-rc\.[1-9][0-9]*)?$/.test(version)||!['pilot','stable'].includes(channel))throw Error('Production release version/channel required');
const sequence=(previous.highest_release_sequence??0)+1;
if(!Number.isSafeInteger(sequence)||sequence<1)throw Error('Monotonic release sequence required');
const manifest=env.RELEASE_MANIFEST_JSON?JSON.parse(env.RELEASE_MANIFEST_JSON):{
 schema_version:'1',release_id:'rel-'+version+'-'+channel,sequence,app_version:version,channel,platform:'linux/amd64',os:'ubuntu:24.04',
 signer_identity:identity,signer_issuer:issuer,min_agent_version:'0.1.0',max_agent_version:'0.9.0',protocol_version:1,compose_template_version:1,
 min_store_schema_version:0,max_store_schema_version:20,target_schema_version:20,migration_policy:'compatible_expand_only',
 not_before:new Date(Date.now()-60000).toISOString(),expires_at:new Date(Date.now()+6*86400000).toISOString(),requires_backup:false,requires_operator_approval:true,revoked:false
};
if(manifest.channel!==channel||manifest.sequence!==sequence||manifest.signer_identity!==identity||manifest.signer_issuer!==issuer)throw Error('Reviewed manifest authority/sequence mismatch');
const trust={Mode:'keyless-v2',ExpectedSourceSHA:env.RELEASE_SOURCE_SHA,MinimumReleaseSequence:sequence,Channel:channel,Registry:'ghcr.io',RepositoryPrefix:'assyauq26/buattokosendiri',SignerIssuer:issuer,SignerIdentity:identity,MaxArtifactBytes:2*1024**3};
const authority=createHash('sha256').update(JSON.stringify(['keyless-v2',issuer,identity,trust.Registry,trust.RepositoryPrefix,channel])).digest('hex');
if(previous.authority_sha256&&previous.authority_sha256!==authority)throw Error('Signing authority changed');
const policy={version:2,artifact_origin:'https://dashboard.buattokosendiri.web.id',trust,verifier_path:'/usr/local/lib/buattokosendiri/cosign',verifier_sha256:verifierSHA,disk_budget:{download_bytes:2*1024**3,expanded_bytes:4*1024**3,update_bytes:6*1024**3,database_bytes:4*1024**3,media_bytes:4*1024**3,reserve_bytes:4*1024**3}};
mkdirSync(dir,{mode:0o700});const write=(name,value)=>writeFileSync(dir+'/'+name,value,{flag:'wx',mode:0o600});
write('previous.json',JSON.stringify(previous));write('manifest-template.json',JSON.stringify(manifest));write('policy.json',JSON.stringify(policy));
write('publication.json',JSON.stringify({Policy:trust,ManifestFile:dir+'/manifest.json',PreviousStateFile:dir+'/previous.json',ArtifactDirectory:'/tmp/btos-release-build',OutputDirectory:'/root/btos-publication/metadata'}));
write('staging.json',JSON.stringify({control_origin:policy.artifact_origin,receipt_file:'/root/btos-publication/archive-receipt.json',policy_file:'/root/btos-publication/policy.json',policy_signature_file:'/tmp/btos-release-build/policy.sigstore.json',installer_file:'/tmp/btos-release-build/jetseller-setup',installer_signature_file:'/tmp/btos-release-build/jetseller-setup.sigstore.json',bundle_file:'/root/btos-publication/release.zip',output_directory:'/root/btos-publication/staged'}));
console.log('Protected keyless publication inputs validated; no production signing keys required');
