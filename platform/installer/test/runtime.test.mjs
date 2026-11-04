import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, chmod } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {generateKeyPairSync} from 'node:crypto';
import { privateFile,runtimeConfig } from '../src/runtime.mjs';
test('private runtime files are descriptor-checked, bounded and reject leaf symlinks',async t=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'p0-auth-config-'));
  const file=path.join(directory,'config');await writeFile(file,'synthetic public config',{mode:0o600});
  assert.equal(await privateFile(file),'synthetic public config');
  await assert.rejects(privateFile('relative-config'));
  const oversized=path.join(directory,'oversized');await writeFile(oversized,'x'.repeat(65537),{mode:0o600});await assert.rejects(privateFile(oversized));
  await assert.rejects(privateFile(directory));
  if(process.platform==='win32')return;
  const link=path.join(directory,'link');await symlink(file,link);await assert.rejects(privateFile(link));
  await chmod(file,0o644);await assert.rejects(privateFile(file));
});

test('agent/session key independence is cryptographic, not PEM formatting',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'p0-key-separation-'));
 const key=()=>generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'});
 const agent=key(),session=key();
 const files={agent,'session':agent+'\n','database':'postgresql://runtime:synthetic@db/jetseller_control_plane',resend:'synthetic-not-a-provider-key',pepper:'a'.repeat(64)};
 for(const [name,value] of Object.entries(files))await writeFile(path.join(directory,name),value,{mode:0o600});
 const config={controlOrigin:'https://dashboard.buattokosendiri.web.id',databaseUrlFile:path.join(directory,'database'),signingKeyFile:path.join(directory,'agent'),emailAuth:{sessionSigningKeyFile:path.join(directory,'session'),resendApiKeyFile:path.join(directory,'resend'),otpPepperFile:path.join(directory,'pepper'),from:'Fixture <otp@fixture.example>'}};
 const file=path.join(directory,'config.json');await writeFile(file,JSON.stringify(config),{mode:0o600});
 await assert.rejects(runtimeConfig(file),/Independent session signing key required/);
 await writeFile(path.join(directory,'session'),session);
 const parsed=await runtimeConfig(file);assert.equal(parsed.releaseAccess.mode,'closed');assert.equal(parsed.authMode,'email_otp');
});
