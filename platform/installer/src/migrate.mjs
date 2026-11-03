import { createPool,migrate } from './db.mjs';
import { privateFile } from './runtime.mjs';

async function main(){
  if(process.env.JETSELLER_CONTROL_MIGRATION_CONFIRM!=='dedicated-control-database')throw new Error('Confirmation required');
  const pool=createPool((await privateFile(process.env.JETSELLER_CONTROL_DATABASE_URL_FILE)).trim());
  try{await migrate(pool);console.log('Dedicated control registry schema ready');}finally{await pool.end();}
}
main().catch(()=>{console.error('Control registry migration refused or failed');process.exitCode=1;});
