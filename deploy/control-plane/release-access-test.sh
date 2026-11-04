#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" = true && "${CONTROL_DISPOSABLE_FIXTURE:-}" = yes ]] || exit 1
dc() { docker compose -f deploy/control-plane/compose.helipod.yml "$@"; }
proxy_id=$(docker inspect -f '{{.Id}}' existing-proxy-fixture)
prepare() { sudo env GITHUB_ACTIONS=true CONTROL_DISPOSABLE_FIXTURE=yes "$(command -v node)" deploy/control-plane/release-access-fixture.mjs "$1"; }
prepare closed
dc restart control
dc up -d --wait control
dc exec -T control node --input-type=module -e "const r=await fetch('http://127.0.0.1:3100/auth/status');const s=await r.json();if(s.configured||s.registration_url!==null)process.exit(1);for(const p of ['/auth/email/start','/api/installer/v1/installations','/bootstrap/downloads/'+ 'a'.repeat(43)]){const x=await fetch('http://127.0.0.1:3100'+p,{method:'POST',body:'{}'});if(x.status!==503)process.exit(1)}"
prepare pilot
dc restart control
dc up -d --wait control
sudo docker cp /tmp/p0-control-fixture/pilot.Caddyfile existing-proxy-fixture:/etc/caddy/pilot-fixture.Caddyfile
docker exec existing-proxy-fixture caddy validate --adapter caddyfile --config /etc/caddy/pilot-fixture.Caddyfile
docker exec existing-proxy-fixture caddy adapt --adapter caddyfile --config /etc/caddy/pilot-fixture.Caddyfile | sudo tee /tmp/p0-control-fixture/pilot-adapted.json >/dev/null
prepare proxy
docker exec existing-proxy-fixture caddy reload --config /etc/caddy/fixture.json
# Host requests are outside the exact loopback-only pilot admission scope.
test "$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: dashboard.buattokosendiri.web.id' -H 'X-Btos-Pilot-Token: forged' http://127.0.0.1/auth/status)" = 503
docker exec existing-proxy-fixture wget -qO- --header='Host: dashboard.buattokosendiri.web.id' http://127.0.0.1/auth/status | grep -q '"configured":true'
denied=$(docker exec existing-proxy-fixture wget -qO- --header='Host: dashboard.buattokosendiri.web.id' http://127.0.0.1/api/installer/v1/session 2>&1 || true)
[[ "$denied" = *'401 Unauthorized'* ]]
curl --fail http://127.0.0.1/ | grep -q existing-site-fixture
test "$proxy_id" = "$(docker inspect -f '{{.Id}}' existing-proxy-fixture)"
prepare closed
dc restart control
dc up -d --wait control
sudo "$(command -v node)" --input-type=module <<'JS'
import {readFileSync,writeFileSync} from 'node:fs';
const path='deploy/control-plane/coexist-fixture.json',value=JSON.parse(readFileSync(path));
value.apps.http.servers.fixture.routes[0].handle=[{handler:'static_response',status_code:503,body:'Temporarily unavailable'}];
writeFileSync(path,JSON.stringify(value));
JS
docker exec existing-proxy-fixture caddy reload --config /etc/caddy/fixture.json
test "$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: dashboard.buattokosendiri.web.id' http://127.0.0.1/auth/status)" = 503
curl --fail http://127.0.0.1/ | grep -q existing-site-fixture
dc exec -T db psql -U control_bootstrap -d jetseller_control_plane -Atc "SELECT count(*) FROM installer.sellers WHERE external_subject='coexist-persistence-fixture'" | grep -qx 1
echo 'PASS closed/pilot/reclosed; forged admission denied; original proxy/site/data preserved'
