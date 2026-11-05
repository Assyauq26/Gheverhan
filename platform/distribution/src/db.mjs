import pg from 'pg';
import {readFile} from 'node:fs/promises';
export function createPool(url){const u=new URL(url);if(!['postgres:','postgresql:'].includes(u.protocol)||!/^\/js_(control|distribution)_[a-z0-9_]+$/.test(u.pathname)||!u.username||!u.password)throw new Error('Dedicated control-plane database required');return new pg.Pool({connectionString:url,max:8,connectionTimeoutMillis:3000,statement_timeout:12000});}
export async function transaction(pool,work){const c=await pool.connect();try{await c.query('BEGIN');const result=await work(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
export async function migrate(pool){await transaction(pool,async c=>{await c.query('SELECT pg_advisory_xact_lock(9148331)');await c.query(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));});}
