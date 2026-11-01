#!/usr/bin/env bash
# JetSeller V3 static-only release. Run ON Helipod VPS: sudo bash release-v3-from-vps.sh
# No Docker restart, DB operation, Caddy rewrite, or Gheverhan change.
set -Eeuo pipefail
umask 022

TARGET_SHA="b82b190da2e9842cfa1b213df8ae56e97d09ee73"
SOURCE="https://raw.githubusercontent.com/Assyauq26/Gheverhan/$TARGET_SHA/landing/jetseller"
FILES="index.html 404.html daftar/index.html masuk/index.html assets/css/main.css assets/css/refactor.css assets/js/main.js assets/img/favicon.svg"
if [[ "$(id -u)" -ne 0 ]]; then echo "BLOCKED: run via sudo bash"; exit 1; fi
for tool in curl docker tar flock; do command -v "$tool" >/dev/null || { echo "BLOCKED: missing $tool"; exit 1; }; done
exec 9>/run/lock/jetseller-static-deploy.lock
flock -n 9 || { echo "BLOCKED: deployment lock busy"; exit 1; }

# Read-only prerequisites.
test -f /opt/gheverhan/deploy/Caddyfile || { echo "BLOCKED: Caddyfile not found"; exit 1; }
grep -Fq 'jetseller.web.id' /opt/gheverhan/deploy/Caddyfile
grep -Fq '/data/landing/jetseller' /opt/gheverhan/deploy/Caddyfile
CADDY_DATA="$(docker inspect deploy_proxy_1 --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}')"
test -n "$CADDY_DATA" && test -d "$CADDY_DATA" || { echo "BLOCKED: /data mount not found"; exit 1; }
case "$CADDY_DATA" in /|/opt|/opt/gheverhan|/opt/gheverhan/deploy) echo "BLOCKED: unsafe mount"; exit 1;; esac
ACTIVE="$CADDY_DATA/landing/jetseller"
test -d "$ACTIVE" && test ! -L "$ACTIVE" && test -f "$ACTIVE/index.html" || { echo "BLOCKED: live assets missing"; exit 1; }
docker exec deploy_proxy_1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
curl -fLsS --max-time 25 -o /dev/null https://gheverhan.store/api/v1/health
curl -fLsS --max-time 25 -o /dev/null https://jetseller.web.id/
echo "Preflight PASS."

DOWNLOAD_DIR="$(mktemp -d /tmp/jetseller-v3.XXXXXXXX)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
STAGED="$CADDY_DATA/landing/jetseller.new-$STAMP"
PREVIOUS="$CADDY_DATA/landing/jetseller.prev-$STAMP"
FAILED="$CADDY_DATA/landing/jetseller.failed-$STAMP"
BACKUP="/opt/gheverhan/deploy/jetseller-landing-backup-$STAMP.tgz"
SWAP_STARTED=0
FINISHED=0
cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [[ "$SWAP_STARTED" -eq 1 && "$FINISHED" -eq 0 ]]; then
    status=1
    echo "Release interrupted or failed: restoring previous JetSeller assets." >&2
    if [[ -d "$PREVIOUS" && ! -L "$PREVIOUS" ]]; then
      if [[ -e "$ACTIVE" || -L "$ACTIVE" ]]; then
        mv -T -- "$ACTIVE" "$FAILED" || {
          echo "CRITICAL: cannot preserve failed assets. Previous: $PREVIOUS; backup: $BACKUP" >&2
          exit 1
        }
      fi
      mv -T -- "$PREVIOUS" "$ACTIVE" || {
        echo "CRITICAL: rollback incomplete. Previous: $PREVIOUS; backup: $BACKUP" >&2
        exit 1
      }
      echo "ROLLBACK COMPLETED (assets restored; check public health)." >&2
    else
      echo "CRITICAL: previous assets unavailable. Inspect $ACTIVE; backup: $BACKUP" >&2
    fi
  fi
  rm -rf -- "$DOWNLOAD_DIR"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Fetch *data assets only* from the pinned, reviewed main commit.
for relative in $FILES; do
  mkdir -p "$DOWNLOAD_DIR/$(dirname "$relative")"
  curl --fail --location --silent --show-error --retry 3 --max-time 35 \
    "$SOURCE/$relative" --output "$DOWNLOAD_DIR/$relative"
  test -s "$DOWNLOAD_DIR/$relative"
done
grep -Fq '/assets/css/refactor.css' "$DOWNLOAD_DIR/index.html"
grep -Fq 'background-size:36px 36px' "$DOWNLOAD_DIR/assets/css/refactor.css"
grep -Fq 'https://gheverhan.store' "$DOWNLOAD_DIR/index.html"
echo "Pinned static files verified."

for reserved in "$STAGED" "$PREVIOUS" "$FAILED" "$BACKUP"; do
  test ! -e "$reserved" && test ! -L "$reserved" || { echo "BLOCKED: release path exists: $reserved"; exit 1; }
done
mkdir -p "$STAGED"
for relative in $FILES; do
  mkdir -p "$STAGED/$(dirname "$relative")"
  cp "$DOWNLOAD_DIR/$relative" "$STAGED/$relative"
done
chown -R root:root "$STAGED"
find "$STAGED" -type d -exec chmod 755 {} +
find "$STAGED" -type f -exec chmod 644 {} +

# Verifiable backup before activating any new file.
tar -czf "$BACKUP" -C "$CADDY_DATA/landing" jetseller
test -s "$BACKUP"
tar -tzf "$BACKUP" >/dev/null
echo "Backup verified: $BACKUP"
SWAP_STARTED=1
mv -T -- "$ACTIVE" "$PREVIOUS"
mv -T -- "$STAGED" "$ACTIVE"

curl -fLsS --max-time 25 -H 'Cache-Control: no-cache' \
  -o "$DOWNLOAD_DIR/verify-index.html" https://jetseller.web.id/
grep -Fq '/assets/css/refactor.css' "$DOWNLOAD_DIR/verify-index.html"
curl -fLsS --max-time 25 -H 'Cache-Control: no-cache' \
  -o "$DOWNLOAD_DIR/verify-refactor.css" https://jetseller.web.id/assets/css/refactor.css
grep -Fq 'background-size:36px 36px' "$DOWNLOAD_DIR/verify-refactor.css"
curl -fLsS --max-time 25 -o /dev/null https://gheverhan.store/api/v1/health
FINISHED=1
echo "SUCCESS: JetSeller V3 LIVE; Gheverhan health OK."
echo "Previous version: $PREVIOUS"
echo "Backup: $BACKUP"
