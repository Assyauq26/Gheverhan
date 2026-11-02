#!/usr/bin/env bash
# Ubuntu disposable CI only. Never accepts an arbitrary production Compose project.
set -euo pipefail
umask 077
repo=$(cd "$(dirname "$0")/../../.." && pwd -P)
snapshot_tool="$repo/deploy/self-hosted/recovery/fixture-snapshot.mjs"
stack=${1:?expected disposable stack directory}
stack=$(realpath -e "$stack")
case "$stack" in /tmp/jetseller-runtime.*/stack) ;; *) echo 'Recovery refused: fixture root required' >&2; exit 1 ;; esac
test ! -L "$stack"
test -f "$stack/.jetseller-disposable"

# Parse only expected fixture identities, never source an environment file as shell code.
identity=$(node --input-type=module - "$stack" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
const root=process.argv[2];
for (const name of ['.jetseller-disposable','.env']) {
 const s=fs.lstatSync(path.join(root,name)); if (!s.isFile() || s.isSymbolicLink()) throw new Error('Fixture refused');
}
const marker=JSON.parse(fs.readFileSync(path.join(root,'.jetseller-disposable'),'utf8'));
if(marker.version!==1 || marker.production!==false || !/^[a-f0-9-]{36}$/.test(marker.installation)) throw new Error('Fixture refused');
const env=Object.fromEntries(fs.readFileSync(path.join(root,'.env'),'utf8').trim().split('\n').map(s=>s.split(/=(.*)/s).slice(0,2)));
const project='jsfixture_'+marker.installation.slice(0,8), db='js_'+marker.installation.replaceAll('-','');
if(env.COMPOSE_PROJECT_NAME!==project || env.JETSELLER_DATABASE_NAME!==db || env.JETSELLER_STORE_DOMAIN!=='store.fixture.example') throw new Error('Fixture refused');
console.log(project+' '+db);
NODE
)
read -r project database <<< "$identity"
dc() { docker compose --project-directory "$stack" -f "$stack/compose.yml" "$@"; }
db_container=$(dc ps -q db)
app_container=$(dc ps -q app)
test -n "$db_container" && test -n "$app_container"
test "$(docker inspect "$db_container" --format '{{index .Config.Labels "com.docker.compose.project"}}')" = "$project"
test "$(docker inspect "$app_container" --format '{{index .Config.Labels "com.docker.compose.project"}}')" = "$project"

workspace=$(mktemp -d /tmp/jetseller-recovery.XXXXXXXX)
snapshot_source="$workspace/source"
snapshot_target="$workspace/restored"
mkdir -m 700 "$workspace/archives"
head -c 32 /dev/urandom > "$workspace/recovery.key"
node "$snapshot_tool" init "$snapshot_source" >/dev/null

# Quiesce application writes before both DB and media capture. No source deletion.
dc stop app >/dev/null
dc exec -T db pg_dump -U js_bootstrap -d "$database" --no-owner --no-acl > "$snapshot_source/database.sql"
docker cp "$app_container:/var/lib/jetseller/media/." "$snapshot_source/media" >/dev/null
sudo cp -R "$stack/private" "$snapshot_source/recovery/private"
cp "$stack/.env" "$snapshot_source/recovery/compose.env"
sudo chown -R "$(id -u):$(id -g)" "$snapshot_source"
chmod -R go-rwx "$snapshot_source"
node "$snapshot_tool" verify "$snapshot_source" > "$workspace/source-checksums.json"
node "$snapshot_tool" backup "$snapshot_source" "$workspace/archives/snapshot.enc" "$workspace/recovery.key" > "$workspace/backup-summary.json"
restore_started=$SECONDS
node "$snapshot_tool" restore "$workspace/archives/snapshot.enc" "$snapshot_target" "$workspace/recovery.key" > "$workspace/restore-summary.json"
node "$snapshot_tool" verify "$snapshot_target" > "$workspace/restored-checksums.json"
cmp "$workspace/source-checksums.json" "$workspace/restored-checksums.json"

# Restore into a fresh independent PostgreSQL container/volume with no host ports/network.
restore_id=$(node -e 'console.log(require("crypto").randomUUID())')
restore_container="jsrestore_${restore_id}"
restore_volume="jsrestore_${restore_id}_db"
pg_image=$(node --input-type=module - "$repo/deploy/self-hosted/images.lock.json" <<'NODE'
import fs from 'node:fs';
const image=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).postgres.image;
if(!/^postgres@sha256:[a-f0-9]{64}$/.test(image)) throw new Error('Pinned PostgreSQL required');
console.log(image);
NODE
)
cleanup() {
 if [ "$(docker inspect "$restore_container" --format '{{index .Config.Labels "jetseller.disposable.recovery"}}' 2>/dev/null || true)" = "$restore_id" ]; then
  docker stop "$restore_container" >/dev/null 2>&1 || true
 fi
}
trap cleanup EXIT
docker volume create --label "jetseller.disposable.recovery=$restore_id" "$restore_volume" >/dev/null
test "$(docker volume inspect "$restore_volume" --format '{{index .Labels "jetseller.disposable.recovery"}}')" = "$restore_id"
head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$workspace/destination-password"
pg_uid=$(docker run --rm --entrypoint id "$pg_image" -u postgres)
sudo chown "$pg_uid:$pg_uid" "$workspace/destination-password"
docker run -d --name "$restore_container" --label "jetseller.disposable.recovery=$restore_id" \
 --network none --memory 1g --cpus 1 --pids-limit 256 \
 -e POSTGRES_USER=js_bootstrap -e "POSTGRES_DB=$database" \
 -e POSTGRES_PASSWORD_FILE=/run/secrets/bootstrap_password \
 --mount "type=bind,source=$workspace/destination-password,target=/run/secrets/bootstrap_password,readonly" \
 --mount "type=volume,source=$restore_volume,target=/var/lib/postgresql/data" "$pg_image" >/dev/null
for attempt in $(seq 1 40); do
 if docker exec "$restore_container" pg_isready -U js_bootstrap -d "$database" >/dev/null 2>&1; then break; fi
 sleep 2
done
docker exec -i "$restore_container" psql -U js_bootstrap -d "$database" -v ON_ERROR_STOP=1 < "$snapshot_target/database.sql" >/dev/null
source_rows=$(dc exec -T db psql -U js_bootstrap -d "$database" -Atc "SELECT id || ':' || label FROM fixture_persistence ORDER BY id")
restore_rows=$(docker exec "$restore_container" psql -U js_bootstrap -d "$database" -Atc "SELECT id || ':' || label FROM fixture_persistence ORDER BY id")
test "$source_rows" = '1:synthetic'
test "$restore_rows" = "$source_rows"
test "$(sha256sum "$snapshot_source/media/persistence-fixture" | cut -d' ' -f1)" = "$(sha256sum "$snapshot_target/media/persistence-fixture" | cut -d' ' -f1)"
test -z "$(docker inspect "$restore_container" --format '{{range $p,$v := .HostConfig.PortBindings}}{{$p}}{{end}}')"
echo "Fixture restore plus independent database initialization/import seconds=$((SECONDS-restore_started))"
cat "$workspace/backup-summary.json" "$workspace/restore-summary.json"
echo 'Separate PostgreSQL restore, synthetic record equality and encrypted media/config checksum verification PASS'
echo 'No source data removed; destination stopped only. Host reboot, off-VPS durability, signing and browser restore remain separate gates.'
