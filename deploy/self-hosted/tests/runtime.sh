#!/usr/bin/env bash
set -euo pipefail
umask 077
repo=$(pwd)
fixture_root=$(mktemp -d /tmp/jetseller-runtime.XXXXXXXX)
context="$fixture_root/context"
node deploy/self-hosted/prepare.mjs context "$context"
sentinel="JS_IMAGE_SECRET_SENTINEL_$(openssl rand -hex 16)"
printf '%s' "$sentinel" > "$context/.env.private-sentinel"
docker build --target runtime -t jetseller-fixture:app "$context"
docker build --target migration -t jetseller-fixture:migration "$context"
app_image=$(docker image inspect jetseller-fixture:app --format '{{.Id}}')
migration_image=$(docker image inspect jetseller-fixture:migration --format '{{.Id}}')
node deploy/self-hosted/prepare.mjs fixture "$fixture_root/stack" store.fixture.example "$app_image" "$migration_image"
cd "$fixture_root/stack"
test -f .jetseller-disposable
# Bind-backed Compose secrets use host ownership; grant only the container UID.
sudo chown 1000:1000 private/runtime.json private/migration.json
pg_image=$(node -p "JSON.parse(require('fs').readFileSync('$repo/deploy/self-hosted/images.lock.json','utf8')).postgres.image")
pg_uid=$(docker run --rm --entrypoint id "$pg_image" -u postgres)
sudo chown "$pg_uid:$pg_uid" private/bootstrap_password private/migration_password private/runtime_password
cat > Caddyfile <<'CADDY'
{
 admin off
}
store.fixture.example {
 tls internal
 reverse_proxy app:3000
}
CADDY
dc() { docker compose --project-directory "$fixture_root/stack" -f "$fixture_root/stack/compose.yml" "$@"; }
cleanup() {
  # Stop fixture services only. Volumes retained until the disposable runner is destroyed.
  dc stop >/dev/null 2>&1 || true
}
trap cleanup EXIT
dc config --format json > "$fixture_root/config.json"
python3 - "$fixture_root/config.json" <<'PY'
import json,sys
j=json.load(open(sys.argv[1]));s=j['services'];assert not s['db'].get('ports');assert not s['app'].get('ports');assert s['app']['user']=='1000:1000';assert not s['app'].get('privileged');assert 'migration_config' not in str(s['app'].get('secrets'));assert 'docker.sock' not in str(j)
PY
dc up -d --wait db
dc run --rm migrate
dc exec -T db sh /opt/jetseller/grant-runtime.sh
# Volume initialization is an explicit local operation; no arbitrary host mount.
project=$(sed -n 's/^COMPOSE_PROJECT_NAME=//p' .env)
installation_id=$(sed -n 's/^JETSELLER_INSTALLATION_ID=//p' .env)
docker run --rm --user 0 --entrypoint node -v "${project}_media:/media" "$app_image" -e "const fs=require('fs');fs.chownSync('/media',1000,1000);fs.chmodSync('/media',0o700);fs.writeFileSync('/media/.jetseller-installation-id',process.argv[1]+'\\n',{mode:0o600,flag:'wx'});fs.chownSync('/media/.jetseller-installation-id',1000,1000)" "$installation_id"
dc up -d --wait app
dc up -d caddy
for attempt in $(seq 1 40); do
 if dc exec -T caddy cat /data/caddy/pki/authorities/local/root.crt > "$fixture_root/ca.pem" 2>/dev/null && curl --noproxy '*' --silent --fail --cacert "$fixture_root/ca.pem" --resolve store.fixture.example:443:127.0.0.1 https://store.fixture.example/api/v1/health > /dev/null; then break; fi
 sleep 2
done
for route in / /admin /api/v1/health; do
 curl --noproxy '*' --silent --show-error --fail --cacert "$fixture_root/ca.pem" --resolve store.fixture.example:443:127.0.0.1 "https://store.fixture.example$route" > /dev/null
done
dc exec -T app node -e "const fs=require('fs');fs.writeFileSync('/var/lib/jetseller/media/persistence-fixture','synthetic-media');if(fs.existsSync('/run/secrets/migration_config'))process.exit(1)"
dc exec -T db psql -U js_bootstrap -d "$(sed -n 's/^JETSELLER_DATABASE_NAME=//p' .env)" -v ON_ERROR_STOP=1 -c "CREATE TABLE fixture_persistence (id integer primary key, label text); INSERT INTO fixture_persistence VALUES (1,'synthetic');" >/dev/null
dc exec -T db psql -U js_bootstrap -d "$(sed -n 's/^JETSELLER_DATABASE_NAME=//p' .env)" -v ON_ERROR_STOP=1 -c 'GRANT SELECT,INSERT,UPDATE,DELETE ON fixture_persistence TO js_runtime' >/dev/null
dc exec -T db sh -s <<'ROLECHECK'
set -eu
export PGPASSWORD=$(cat /run/secrets/runtime_password)
psql -h 127.0.0.1 -U js_runtime -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "UPDATE fixture_persistence SET label='synthetic' WHERE id=1; SELECT count(*) FROM _prisma_migrations;" >/dev/null
for sql in 'CREATE TABLE must_not_exist(id int)' 'CREATE ROLE must_not_exist' 'DELETE FROM _prisma_migrations'; do
 if psql -h 127.0.0.1 -U js_runtime -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "$sql" >/dev/null 2>&1; then
  echo 'Runtime privilege separation failed'; exit 1
 fi
done
ROLECHECK
dc restart db app
dc up -d --wait app
dc exec -T app node -e "if(require('fs').readFileSync('/var/lib/jetseller/media/persistence-fixture','utf8')!=='synthetic-media')process.exit(1)"
test "$(dc exec -T db psql -U js_bootstrap -d "$(sed -n 's/^JETSELLER_DATABASE_NAME=//p' .env)" -Atc 'SELECT count(*) FROM fixture_persistence')" = 1
# Ensure every saved layer, not just the final filesystem, excludes the sentinel.
for image in "$app_image" "$migration_image"; do
 docker save "$image" -o "$fixture_root/image.tar"
 SENTINEL="$sentinel" python3 - "$fixture_root/image.tar" <<'PY'
import os,sys,tarfile
needle=os.environ['SENTINEL'].encode()
with tarfile.open(sys.argv[1]) as archive:
 for member in archive:
  if member.isfile():
   stream=archive.extractfile(member);tail=b''
   while chunk:=stream.read(1024*1024):
    assert needle not in tail+chunk,'Secret sentinel found in image layer';tail=chunk[-len(needle):]
PY
done
docker image inspect "$app_image" --format 'App image bytes={{.Size}} user={{.Config.User}}'
df -h "$fixture_root"
free -m
echo 'Disposable container/TLS/persistence/secret-layer checks PASS; public ACME, VPS reboot, restore and signing not established here'
