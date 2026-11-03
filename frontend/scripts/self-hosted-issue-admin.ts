/** Local operator only. No claim, password or DSN is printed. */
import { lstat, open, readFile, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { issueLocalAdminClaim, localSetupConfig } from '../src/lib/self-hosted/admin-claim';

async function main() {
  const args=process.argv.slice(2);
  if(args.length!==4||args[0]!=='--config'||args[2]!=='--out')throw new Error('Invalid arguments');
  const file=path.resolve(args[1]), target=path.resolve(args[3]);
  if(await realpath(file)!==file||await realpath(path.dirname(target))!==path.dirname(target))throw new Error('Invalid path');
  const configStat=await lstat(file), parent=await lstat(path.dirname(target));
  if(!configStat.isFile()||configStat.isSymbolicLink()||configStat.size>16384||!parent.isDirectory()||parent.isSymbolicLink()||process.platform!=='win32'&&((configStat.mode&0o077)||(parent.mode&0o077)))throw new Error('Private configuration required');
  const env=JSON.parse(await readFile(file,'utf8')) as Record<string,string>;
  localSetupConfig(env);
  const output=await open(target,'wx',0o600);
  const db=new PrismaClient({log:[],datasources:{db:{url:env.DATABASE_URL}}});
  let complete=false;
  try {
    const result=await issueLocalAdminClaim(db,env);
    await output.writeFile(JSON.stringify({...result,installationId:env.JETSELLER_INSTALLATION_ID})+'\n');
    await output.sync(); complete=true;
  } finally {await output.close();await db.$disconnect();if(!complete)await unlink(target);}
  console.log('Local admin claim written to private file; secret omitted');
}
main().catch(()=>{console.error('Local admin claim could not be issued');process.exitCode=1;});
