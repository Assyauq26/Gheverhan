import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registrationCaddy} from '../../../deploy/registration/render-caddy.mjs';
test('proxy has one hostname, overwrites trusted address and publishes no backend port',()=>{
 const text=registrationCaddy('a'.repeat(64));assert.match(text,/^buattokosendiri\.web\.id \{/);assert.doesNotMatch(text,/gheverhan\.store|dashboard\.buattokosendiri/);assert.match(text,/X-Btos-Client-IP \{http.request.remote.host\}/);assert.match(text,/rewrite @form \/pendaftaran\/index.html/);assert.match(text,/redir @legacy \/pendaftaran 308/);assert.throws(()=>registrationCaddy('untrusted\nconfig'));
 const compose=readFileSync(new URL('../../../deploy/registration/compose.helipod.yml',import.meta.url),'utf8');assert.doesNotMatch(compose,/ports:|docker.sock|privileged:|deploy_db|deploy_app/);assert.match(compose,/btos-control_database/);assert.match(compose,/read_only: true/);assert.match(compose,/mem_limit: 128m/);
});
