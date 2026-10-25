#!/usr/bin/env bash
set -Eeuo pipefail

if [[ -n "${SSH_ORIGINAL_COMMAND:-}" ]]; then
  echo "Remote commands are disabled for this deploy key." >&2
  exit 64
fi

DEPLOY_DIR=/opt/gheverhan/deploy
ENV_FILE="$DEPLOY_DIR/.env"
COMPOSE_FILE="$DEPLOY_DIR/compose.yml"
COMPOSE_PROJECT=deploy
HEALTH_URL=http://127.0.0.1:3000/api/v1/health
LOCK_FILE=/run/lock/gheverhan-deploy.lock

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another Gheverhan deployment is already running." >&2
  exit 75
fi

[[ -f "$ENV_FILE" && -f "$COMPOSE_FILE" ]] || {
  echo "Gheverhan VPS deployment files are missing." >&2
  exit 66
}
command -v docker >/dev/null
command -v docker-compose >/dev/null
command -v gzip >/dev/null
command -v curl >/dev/null
command -v python3 >/dev/null

cd "$DEPLOY_DIR"

# Docker archives sent by the workflow contain exactly one runtime image and
# one temporary migration image, both tagged with the full source commit SHA.
LOAD_OUTPUT="$(gzip -dc | docker load)"
printf '%s\n' "$LOAD_OUTPUT" >&2

mapfile -t APP_IMAGES < <(printf '%s\n' "$LOAD_OUTPUT" | sed -nE 's/^Loaded image: (gheverhan:[0-9a-f]{40})$/\1/p')
mapfile -t MIGRATION_IMAGES < <(printf '%s\n' "$LOAD_OUTPUT" | sed -nE 's/^Loaded image: (gheverhan-migrate:[0-9a-f]{40})$/\1/p')
[[ "${#APP_IMAGES[@]}" -eq 1 && "${#MIGRATION_IMAGES[@]}" -eq 1 ]] || {
  echo "The image stream must contain one matching application and migration image." >&2
  exit 65
}
APP_IMAGE="${APP_IMAGES[0]}"
MIGRATION_IMAGE="${MIGRATION_IMAGES[0]}"
APP_SHA="${APP_IMAGE#gheverhan:}"
MIGRATION_SHA="${MIGRATION_IMAGE#gheverhan-migrate:}"
[[ "$APP_SHA" == "$MIGRATION_SHA" ]] || {
  echo "Application and migration images came from different commits." >&2
  exit 65
}

APP_REVISION="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$APP_IMAGE")"
MIGRATION_REVISION="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$MIGRATION_IMAGE")"
[[ "$APP_REVISION" == "$APP_SHA" && "$MIGRATION_REVISION" == "$APP_SHA" ]] || {
  echo "Image revision labels do not match the immutable image tags." >&2
  exit 65
}

OLD_CONTAINER="$(docker-compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" ps -q app)"
[[ -n "$OLD_CONTAINER" ]] || {
  echo "The current application container is missing; refusing an unattended first deployment." >&2
  exit 69
}
OLD_IMAGE="$(docker inspect --format '{{.Config.Image}}' "$OLD_CONTAINER")"
[[ "$OLD_IMAGE" =~ ^gheverhan:[A-Za-z0-9._-]+$ ]] || {
  echo "The current application image tag is not a recognized Gheverhan image." >&2
  exit 69
}

# Confirm the existing persistent branding/product-media bind mount is real
# and writable by UID 1000, the non-root app identity. A second fresh
# container verifies that the bytes survive a container boundary.
MEDIA_DIR=/opt/gheverhan/media
[[ -d "$MEDIA_DIR" && ! -L "$MEDIA_DIR" ]] || {
  echo "Persistent media directory is missing or is a symlink." >&2
  exit 73
}
MEDIA_PROBE="/data/media/.gheverhan-customize-preflight-$APP_SHA"
docker run --rm --network none --user 1000:1000 \
  --mount "type=bind,source=$MEDIA_DIR,target=/data/media" \
  --env "MEDIA_PROBE=$MEDIA_PROBE" \
  --entrypoint node "$APP_IMAGE" \
  -e 'const fs=require("node:fs"); fs.writeFileSync(process.env.MEDIA_PROBE,"gheverhan-media",{flag:"wx",mode:0o600});'
docker run --rm --network none --user 1000:1000 \
  --mount "type=bind,source=$MEDIA_DIR,target=/data/media" \
  --env "MEDIA_PROBE=$MEDIA_PROBE" \
  --entrypoint node "$APP_IMAGE" \
  -e 'const fs=require("node:fs"); const p=process.env.MEDIA_PROBE; if(fs.readFileSync(p,"utf8")!=="gheverhan-media")process.exit(1); fs.unlinkSync(p);'
echo "Persistent media volume passed non-root cross-container write/read test"


POSTGRES_PASSWORD="$(python3 - "$ENV_FILE" <<'PY'
import pathlib
import re
import sys

path = pathlib.Path(sys.argv[1])
values = []
for line in path.read_text(encoding="utf-8").splitlines():
    if line.startswith("POSTGRES_PASSWORD="):
        value = line.partition("=")[2].strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        values.append(value)
if len(values) != 1 or not re.fullmatch(r"[0-9A-Fa-f]{32,}", values[0]):
    raise SystemExit("The VPS owner password must be a single URL-safe hexadecimal value.")
print(values[0])
PY
)"
MIGRATION_DATABASE_URL="postgresql://gheverhan:${POSTGRES_PASSWORD}@db:5432/gheverhan?schema=public&connection_limit=5"
unset POSTGRES_PASSWORD

# Run migrations from the build stage, which still contains the Prisma CLI.
# The owner URL is scoped to this one-shot container and never enters the app.
GHEVERHAN_IMAGE="$MIGRATION_IMAGE" docker-compose \
  -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" \
  run --rm --no-deps \
  -e "DATABASE_URL=$MIGRATION_DATABASE_URL" \
  -e "DIRECT_URL=$MIGRATION_DATABASE_URL" \
  --entrypoint node app \
  /app/node_modules/prisma/build/index.js migrate deploy
unset MIGRATION_DATABASE_URL

# Refresh table and sequence grants for objects introduced by this migration.
python3 /usr/local/sbin/gheverhan-prepare-runtime.py

# Read-only Customize schema, RLS, permissions and storage configuration gate
# against the actual Production runtime role, after the additive migration.
GHEVERHAN_IMAGE="$MIGRATION_IMAGE" docker-compose \
  -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" \
  run --rm --no-deps --entrypoint node app \
  --conditions=react-server --import tsx /app/scripts/appearance/preflight.ts
echo "Production Customize preflight passed"


wait_for_health() {
  local attempt
  for attempt in $(seq 1 30); do
    if curl --silent --show-error --fail --max-time 3 -o /dev/null "$HEALTH_URL"; then
      return 0
    fi
    sleep 2
  done
  return 1
}

restore_previous_app() {
  echo "New app failed its local health check; restoring the previous image." >&2
  docker-compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" stop app >/dev/null 2>&1 || true
  docker-compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" rm -f app >/dev/null 2>&1 || true
  if GHEVERHAN_IMAGE="$OLD_IMAGE" docker-compose \
      -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" up -d --no-deps app; then
    if wait_for_health; then
      echo "Previous app image restored and healthy." >&2
      return 0
    fi
  fi
  echo "Rollback could not restore a healthy app; inspect the VPS before retrying." >&2
  return 1
}

# Compose v1.29 on this VPS cannot recreate a service in place reliably, so
# remove only the stateless app container before starting the tested image.
docker-compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" stop app
docker-compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" rm -f app
if ! GHEVERHAN_IMAGE="$APP_IMAGE" docker-compose \
    -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" up -d --no-deps app; then
  restore_previous_app || true
  exit 1
fi
if ! wait_for_health; then
  restore_previous_app || true
  exit 1
fi

if ! python3 - "$ENV_FILE" "$APP_IMAGE" <<'PY'
import os
import pathlib
import re
import stat
import sys
import tempfile

path = pathlib.Path(sys.argv[1])
image = sys.argv[2]
text = path.read_text(encoding="utf-8")
updated, count = re.subn(r"(?m)^GHEVERHAN_IMAGE=.*$", f"GHEVERHAN_IMAGE={image}", text)
if count != 1:
    raise SystemExit("Expected exactly one GHEVERHAN_IMAGE entry in the VPS environment file.")
mode = stat.S_IMODE(path.stat().st_mode)
fd, temporary = tempfile.mkstemp(prefix=".gheverhan-env-", dir=path.parent)
try:
    os.fchmod(fd, mode)
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        stream.write(updated)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
finally:
    try:
        os.unlink(temporary)
    except FileNotFoundError:
        pass
PY
then
  python3 - "$ENV_FILE" "$OLD_IMAGE" <<'PY'
import os
import pathlib
import re
import sys
import tempfile

path = pathlib.Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
updated, count = re.subn(r"(?m)^GHEVERHAN_IMAGE=.*$", f"GHEVERHAN_IMAGE={sys.argv[2]}", text)
if count == 1:
    fd, temporary = tempfile.mkstemp(prefix=".gheverhan-env-rollback-", dir=path.parent)
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        stream.write(updated)
        stream.flush()
        os.fsync(stream.fileno())
    os.chmod(temporary, path.stat().st_mode & 0o777)
    os.replace(temporary, path)
PY
  restore_previous_app || true
  exit 1
fi

docker image rm "$MIGRATION_IMAGE" >/dev/null 2>&1 || true
echo "DEPLOYMENT_OK commit=$APP_SHA health=200"
