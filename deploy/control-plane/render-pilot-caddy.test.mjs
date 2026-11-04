import test from 'node:test';
import assert from 'node:assert/strict';
import {pilotCaddy} from './render-pilot-caddy.mjs';
test('pilot proxy admits only explicit IPs and overwrites admission header',()=>{
 const result=pilotCaddy('a'.repeat(64),['192.0.2.10','2001:db8::10']);
 assert.match(result,/@pilot remote_ip 192\.0\.2\.10 2001:db8::10/);
 assert.match(result,/header_up X-Btos-Pilot-Token a{64}/);assert.match(result,/respond "Temporarily unavailable" 503/);
 assert.match(result,/respond @private 404/);
 for(const ips of [[],['0.0.0.0/0'],['::/0'],['::'],['evil\nreverse_proxy evil'],Array(9).fill('192.0.2.10')])assert.throws(()=>pilotCaddy('a'.repeat(64),ips));
 assert.throws(()=>pilotCaddy('fixture-key', ['192.0.2.10']));
});
