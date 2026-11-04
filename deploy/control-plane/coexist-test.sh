#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" = true && "${CONTROL_DISPOSABLE_FIXTURE:-}" = yes ]] || exit 1
dc() { docker compose -f deploy/control-plane/compose.helipod.yml "$@"; }
docker network create --internal btos_control_ingress
# Existing proxy starts FIRST and owns both ports. No production host is contacted.
docker run -d --name existing-proxy-fixture --network btos_control_ingress -p80:80 -p443:443 -v "$PWD/deploy/control-plane/coexist-fixture.Caddyfile:/etc/caddy/Caddyfile:ro" caddy@sha256:04913b1da43339a40ad1ea87827d70a576ac5aa6cf674c6e24fdca675887533a
proxy_id=$(docker inspect -f '{{.Id}}' existing-proxy-fixture)
dc up -d --wait control
curl --fail --retry 10 --retry-delay 1 --retry-connrefused http://127.0.0.1/ | grep -q existing-site-fixture
curl --fail -H 'Host: dashboard.buattokosendiri.web.id' http://127.0.0.1/auth/status | grep -q email_otp
test -z "$(dc port control 3100)"; test -z "$(dc port db 5432)"
dc exec -T db psql -U control_bootstrap -d jetseller_control_plane -v ON_ERROR_STOP=1 -c "INSERT INTO installer.sellers(id,external_subject,email_verified) VALUES('abababab-0000-4000-8000-000000000001','coexist-persistence-fixture',true)"
dc restart db control
dc up -d --wait control
dc run --rm migrate
dc up -d --force-recreate --wait control
dc exec -T db psql -U control_bootstrap -d jetseller_control_plane -Atc "SELECT count(*) FROM installer.sellers WHERE external_subject='coexist-persistence-fixture'" | grep -qx 1
test "$proxy_id" = "$(docker inspect -f '{{.Id}}' existing-proxy-fixture)"
curl --fail http://127.0.0.1/ | grep -q existing-site-fixture
curl --fail -H 'Host: dashboard.buattokosendiri.web.id' http://127.0.0.1/auth/status | grep -q email_otp
# Restoring a disposable database is separate from changing the source database.
dc exec -T db pg_dump -U control_bootstrap -d jetseller_control_plane -Fc > /tmp/control-fixture.dump
dc exec -T db createdb -U control_bootstrap jetseller_control_restore
dc exec -T db pg_restore -U control_bootstrap -d jetseller_control_restore < /tmp/control-fixture.dump
dc exec -T db psql -U control_bootstrap -d jetseller_control_restore -Atc "SELECT count(*) FROM installer.sellers WHERE external_subject='coexist-persistence-fixture'" | grep -qx 1
echo 'PASS: occupied ports, private proxy, unchanged existing proxy, DB restart/redeploy/migrations and disposable restore; SYNTHETIC_NOT_PRODUCTION'
