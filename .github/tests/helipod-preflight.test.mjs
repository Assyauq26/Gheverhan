import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isHelipodIdentity, verifyLocalMedia } from '../../frontend/scripts/release/helipod-preflight.mjs';
const env = { GHEVERHAN_DEPLOYMENT_TARGET:'helipod', GHEVERHAN_ALLOW_VPS_READ_ONLY:'1', STORAGE_PROVIDER:'local', STORAGE_LOCAL_ROOT:'/data/media', APP_ORIGIN:'https://gheverhan.store', DATABASE_URL:'postgresql://gheverhan_runtime:fixture@db:5432/gheverhan', DIRECT_URL:'postgresql://gheverhan_runtime:fixture@db:5432/gheverhan', PREFLIGHT_LEDGER_DATABASE_URL:'postgresql://gheverhan:fixture@db:5432/gheverhan' };
test('explicit Helipod identity accepts separate runtime and ledger credentials', () => assert.equal(isHelipodIdentity(env),true));
for (const [key,value] of Object.entries({GHEVERHAN_DEPLOYMENT_TARGET:'',GHEVERHAN_ALLOW_VPS_READ_ONLY:'',STORAGE_PROVIDER:'supabase',STORAGE_LOCAL_ROOT:'/tmp',APP_ORIGIN:'https://evil.invalid',GHEVERHAN_ISOLATED_TESTS:'1',PREFLIGHT_LEDGER_DATABASE_URL:''})) {
  test(`fails closed for ${key}`, () => assert.equal(isHelipodIdentity({...env,[key]:value}),false));
}
for (const key of ['DATABASE_URL','DIRECT_URL','PREFLIGHT_LEDGER_DATABASE_URL']) {
  for (const url of ['postgresql://gheverhan:fixture@db/gheverhan','postgresql://gheverhan_runtime:fixture@evil/gheverhan','postgresql://gheverhan_runtime:fixture@db:5433/gheverhan','postgresql://gheverhan_runtime:fixture@db/other','postgresql://gheverhan_runtime:fixture@db/gheverhan?schema=other','invalid']) {
    if (key === 'PREFLIGHT_LEDGER_DATABASE_URL' && url === 'postgresql://gheverhan:fixture@db/gheverhan') continue;
    test(`${key} rejects ${url}`, () => assert.equal(isHelipodIdentity({...env,[key]:url}),false));
  }
}
test('local storage does not accept a temporary directory as persistence evidence', async () => assert.equal((await verifyLocalMedia({...env,STORAGE_LOCAL_ROOT:'/tmp'})).status,'BLOCKED'));
