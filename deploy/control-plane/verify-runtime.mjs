import {runtimeConfig} from './src/runtime.mjs';
import {createPool} from './src/db.mjs';
const c=await runtimeConfig(process.env.JETSELLER_CONTROL_CONFIG_FILE);
const p=createPool(c.databaseUrl);
try {
 const r=await p.query("SELECT has_schema_privilege(current_user,'installer','CREATE') AS ddl");
 if(r.rows[0].ddl)throw Error('runtime must not own schema');
 await p.query('SELECT * FROM installer.email_challenges LIMIT 0');
 await p.query('SELECT * FROM installer.domain_challenges LIMIT 0');
} finally {await p.end();}
