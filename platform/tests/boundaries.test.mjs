import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canonicalHost,assertClaimableDomain,resolveStorefront,assertPlatformOwner,assertSellerTenant} from '../src/boundaries.mjs';
test('canonical hosts reject URLs, ports, credentials, injected headers and ambiguous labels',()=>{
  assert.equal(canonicalHost('Gheverhan.store.'),'gheverhan.store');
  for(const host of ['https://gheverhan.store','gheverhan.store:443','a@b.store',' gheverhan.store','a..store','-a.store','a-.store','x\r\nHost: y.store','localhost','*.jetseller.web.id'])assert.throws(()=>canonicalHost(host));
});
test('platform and dashboard namespaces cannot be claimed by sellers',()=>{
  for(const host of ['jetseller.web.id','dashboard.jetseller.web.id','evil.dashboard.jetseller.web.id','www.jetseller.web.id','shops.jetseller.web.id'])assert.throws(()=>assertClaimableDomain(host));
  assert.equal(assertClaimableDomain('gheverhan.store'),'gheverhan.store');
  assert.equal(assertClaimableDomain('brand.shops.jetseller.web.id'),'brand.shops.jetseller.web.id');
});
test('exact verified domain resolves only its registered active tenant',async()=>{
  const tenant={id:'tenant_gheverhan_001',status:'ACTIVE',databaseSecretRef:'vault:tenant-001'};
  const domain={hostname:'gheverhan.store',status:'ACTIVE',verifiedAt:new Date(),tlsReadyAt:new Date(),tenant};
  assert.equal((await resolveStorefront('gheverhan.store',{findDomain:async h=>{assert.equal(h,'gheverhan.store');return domain;}})).tenantId,tenant.id);
  for(const bad of [null,{...domain,hostname:'other.store'},{...domain,verifiedAt:null},{...domain,tlsReadyAt:null},{...domain,status:'PENDING'},{...domain,tenant:{...tenant,databaseSecretRef:null}},{...domain,tenant:{...tenant,status:'SUSPENDED'}}])await assert.rejects(resolveStorefront('gheverhan.store',{findDomain:async()=>bad}));
  await assert.rejects(resolveStorefront('dashboard.jetseller.web.id',{findDomain:()=>{throw Error('must not query tenant');}}));
});
test('store Super Admin and matching email never grant platform authority',()=>{
  const owner={authority:'jetseller-control-plane',audience:'jetseller-superadmin',role:'PLATFORM_OWNER',active:true,sessionActive:true};
  assert.doesNotThrow(()=>assertPlatformOwner(owner));
  for(const override of [{authority:'gheverhan'},{role:'Super Admin'},{audience:'jetseller-dashboard'},{active:false},{sessionActive:false}])assert.throws(()=>assertPlatformOwner({...owner,...override}));
});
test('seller session must match both seller and tenant and cannot cross audiences',()=>{
  const identity={authority:'jetseller-control-plane',audience:'jetseller-dashboard',role:'SELLER',active:true,sessionActive:true,sellerId:'seller-a',tenantId:'tenant-a'};
  const tenant={id:'tenant-a',sellerId:'seller-a',status:'ACTIVE'};
  assert.doesNotThrow(()=>assertSellerTenant(identity,tenant));
  for(const other of [{...tenant,id:'tenant-b'},{...tenant,sellerId:'seller-b'},{...tenant,status:'SUSPENDED'}])assert.throws(()=>assertSellerTenant(identity,other));
  for(const override of [{audience:'jetseller-superadmin'},{authority:'gheverhan'},{active:false},{sessionActive:false},{role:'PLATFORM_OWNER'}])assert.throws(()=>assertSellerTenant({...identity,...override},tenant));
});
