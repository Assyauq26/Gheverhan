import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TenantClientPool} from '../src/tenant-client-pool.mjs';
const scope=id=>({tenantId:id,status:'ACTIVE',databaseSecretRef:'vault:'+id});
test('concurrent leases reuse one tenant client without disconnecting an active request',async()=>{
  let created=0,closed=0;
  const pool=new TenantClientPool(async s=>{assert.equal(s.connectionLimit,2);created++;return {$disconnect:async()=>{closed++;}};},{maxClients:1});
  const [a,b]=await Promise.all([pool.lease(scope('a')),pool.lease(scope('a'))]);
  assert.equal(created,1);assert.equal(a.client,b.client);
  await assert.rejects(pool.lease(scope('b')),/capacity/);assert.equal(closed,0);
  await a.release();await a.release();await assert.rejects(pool.close(),/active/);
  await b.release();await pool.close();assert.equal(closed,1);
});
test('bounded LRU evicts only idle clients and never mixes tenant handles',async()=>{
  const closed=[];
  const pool=new TenantClientPool(async s=>({tenant:s.tenantId,$disconnect:async()=>{closed.push(s.tenantId);}}),{maxClients:2});
  const a=await pool.lease(scope('a'));const b=await pool.lease(scope('b'));await a.release();
  const c=await pool.lease(scope('c'));assert.deepEqual(closed,['a']);assert.equal(c.client.tenant,'c');assert.equal(b.client.tenant,'b');
  await c.release();await b.release();await pool.close();
});
test('callback failures release capacity; factory failures do not poison serialization',async()=>{
  let failed=false;
  const pool=new TenantClientPool(async s=>{if(s.tenantId==='bad')throw Error('synthetic vault failure');return {$disconnect:async()=>{}};},{maxClients:1});
  await assert.rejects(pool.lease(scope('bad')),/vault/);
  await assert.rejects(pool.withTenant(scope('a'),async()=>{failed=true;throw Error('callback failed');}),/callback/);assert.equal(failed,true);
  await pool.withTenant(scope('b'),async()=>{});await pool.close();await assert.rejects(pool.lease(scope('a')),/closed/);
});
test('rotation waits for active leases and does not reuse the previous credential client',async()=>{
  let created=0;
  const pool=new TenantClientPool(async()=>({generation:++created,$disconnect:async()=>{}}));
  const first=await pool.lease(scope('a'));const rotated={...scope('a'),databaseSecretRef:'vault:a-v2'};
  await assert.rejects(pool.lease(rotated),/rotation/);await first.release();
  const second=await pool.lease(rotated);assert.notEqual(second.client,first.client);await second.release();await pool.close();
});
test('rejects inactive scopes and invalid connection budgets',async()=>{
  assert.throws(()=>new TenantClientPool(()=>{}, {maxClients:0}));
  assert.throws(()=>new TenantClientPool(()=>{}, {connectionLimit:100}));
  const pool=new TenantClientPool(async()=>({$disconnect:async()=>{}}));
  assert.throws(()=>{pool.maxClients=1000;});
  for(const s of [null,{...scope('a'),status:'SUSPENDED'},{...scope('a'),databaseSecretRef:''}])await assert.rejects(pool.lease(s));
  await pool.close();
});
test('pending acquisitions are bounded without blocking lease release',async()=>{
  let enter,unblock;
  const entered=new Promise(r=>{enter=r;}),gate=new Promise(r=>{unblock=r;});
  const pool=new TenantClientPool(async()=>{enter();await gate;return {$disconnect:async()=>{}};},{maxPending:2});
  const first=pool.lease(scope('a'));await entered;const second=pool.lease(scope('a'));
  await assert.rejects(pool.lease(scope('b')),/queue capacity/);unblock();
  const leases=await Promise.all([first,second]);for(const lease of leases)await lease.release();await pool.close();
});
test('per-tenant in-flight leases are bounded and recover after release',async()=>{
  const pool=new TenantClientPool(async()=>({$disconnect:async()=>{}}),{maxLeasesPerTenant:1});
  const a=await pool.lease(scope('a'));
  await assert.rejects(pool.lease(scope('a')),/active lease capacity/);
  const b=await pool.lease(scope('b'));await a.release();
  const again=await pool.lease(scope('a'));await again.release();await b.release();await pool.close();
});
