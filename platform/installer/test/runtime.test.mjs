import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, chmod } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { privateFile } from '../src/runtime.mjs';
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
