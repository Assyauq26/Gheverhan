import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { fail, hash } from './common.mjs';

export function createPool(connectionString) {
  const url = new URL(connectionString);
  if (!['postgres:','postgresql:'].includes(url.protocol) || !/^(jetseller_control|js_control_)[a-z0-9_]*$/.test(url.pathname.slice(1))) throw new Error('Dedicated control database required');
  return new pg.Pool({ connectionString, max:8, connectionTimeoutMillis:2000, idleTimeoutMillis:10000,
    statement_timeout:2500, query_timeout:3500, application_name:'jetseller-installer-control' });
}
export async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(9148327)');
    await client.query(await readFile(new URL('../migrations/001_registry.sql', import.meta.url), 'utf8'));
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
export async function transaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '1500ms'");
    const value = await work(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') fail(409,'CONFLICT');
    throw error;
  } finally { client.release(); }
}
export async function rate(pool, key, limit, seconds = 60) {
  const bucket = hash(key + ':' + Math.floor(Date.now() / (seconds * 1000)));
  await pool.query('DELETE FROM installer.rate_limits WHERE expires_at < now()');
  const result = await pool.query(`INSERT INTO installer.rate_limits(bucket,count,expires_at) VALUES($1,1,now()+$2*interval '1 second')
    ON CONFLICT(bucket) DO UPDATE SET count=installer.rate_limits.count+1 RETURNING count`,[bucket, seconds * 2]);
  if (result.rows[0].count > limit) fail(429,'RATE_LIMITED');
}
