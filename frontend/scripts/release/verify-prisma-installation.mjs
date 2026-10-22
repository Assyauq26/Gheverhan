/** Secret-free native engine compatibility check, before protected bindings. */
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import path from 'node:path';
const require = createRequire(path.join(process.cwd(),'package.json'));
try {
  const {Prisma}=require('@prisma/client');
  const expected='605197351a3c8bdd595af2d2a9bc3025bca48ea2';
  if(require('@prisma/client/package.json').version!=='5.22.0'||require('prisma/package.json').version!=='5.22.0'||Prisma.prismaVersion.client!=='5.22.0'||Prisma.prismaVersion.engine!==expected)throw new Error();
  const directory=path.dirname(require.resolve('.prisma/client/default'));
  const files=readdirSync(directory).filter(n=>/^libquery_engine-debian-openssl-3\.0\.x\.so\.node$/.test(n));
  if(files.length!==1||require(path.join(directory,files[0])).version().commit!==expected)throw new Error();
  console.log('PRISMA_ENGINE_DIAGNOSTIC=CLIENT_CLI_GENERATED_NATIVE_ENGINE_5_22_MATCH');
} catch {console.error('PRISMA_ENGINE_DIAGNOSTIC=ENGINE_INSTALLATION_BLOCKED');process.exitCode=1;}
