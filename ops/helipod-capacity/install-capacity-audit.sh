#!/usr/bin/env bash
# REVIEW/APPROVAL REQUIRED: provisions a separate restricted diagnostics identity.
# Never run through the existing deployment key. No cleanup/deploy/migrations.
set -Eeuo pipefail
[[ "$EUID" -eq 0 && "$#" -eq 2 ]] || {
  echo 'Usage (approved administrator only): install-capacity-audit.sh PUBLIC_KEY_FILE APPROVED_COLLECTOR_SHA256' >&2
  exit 64
}
[[ "$2" =~ ^[a-f0-9]{64}$ ]] || exit 64
source_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
collector="$source_dir/capacity-audit.py"
[[ -f "$collector" && ! -L "$collector" && -f "$1" && ! -L "$1" ]] || exit 66
python3 -I - "$collector" "$1" <<'PY'
import os,stat,sys
for p in sys.argv[1:]:
    s=os.stat(p,follow_symlinks=False)
    if s.st_uid != 0 or not stat.S_ISREG(s.st_mode) or s.st_mode & 0o022:
        raise SystemExit('BLOCKED: stage reviewed collector/public key as root-owned, non-writable files')
PY
[[ "$(sha256sum "$collector" | cut -d' ' -f1)" == "$2" ]] || {
  echo 'BLOCKED: collector differs from approved checksum' >&2; exit 65;
}
command -v visudo >/dev/null
command -v ionice >/dev/null
command -v timeout >/dev/null
ssh-keygen -l -f "$1" >/dev/null 2>&1 || exit 65
public_key="$(python3 -I - "$1" <<'PY'
import pathlib,re,sys
s=pathlib.Path(sys.argv[1]).read_text().strip()
if not re.fullmatch(r'ssh-ed25519 [A-Za-z0-9+/]+={0,2}(?: [^\r\n]*)?',s):
    raise SystemExit('BLOCKED: supply one plain Ed25519 PUBLIC key')
print(' '.join(s.split(' ')[:2])+' github-actions-gheverhan-capacity')
PY
)"
audit_home=/var/lib/gheverhan-audit
audit_program=/usr/local/sbin/gheverhan-capacity-audit
sudoers=/etc/sudoers.d/gheverhan-capacity-audit
# Do not replace an existing identity's policy or follow a writable home symlink.
for path in "$audit_home" "$audit_home/.ssh" "$audit_home/.ssh/authorized_keys" "$audit_program" "$sudoers"; do
  [[ ! -L "$path" ]] || { echo 'BLOCKED: symlink in audit installation' >&2; exit 65; }
done
if getent passwd gheverhan-audit >/dev/null || [[ -e "$audit_home" || -e "$sudoers" || -e "$audit_program" ]]; then
  echo 'BLOCKED: existing audit identity or policy requires review, not replacement' >&2
  exit 65
fi
[[ -d /usr/local/sbin && -d /etc/sudoers.d && ! -L /etc/sudoers.d ]] || {
  echo 'BLOCKED: expected administrator-owned installation directories missing' >&2; exit 65;
}
temporary="$(mktemp)"
trap 'rm -f "$temporary"' EXIT
cat > "$temporary" <<'POLICY'
Defaults:gheverhan-audit env_keep += "SSH_ORIGINAL_COMMAND"
gheverhan-audit ALL=(root) NOPASSWD: /usr/local/sbin/gheverhan-capacity-audit ""
POLICY
visudo -cf "$temporary" >/dev/null
useradd --system --user-group --no-create-home --home-dir "$audit_home" --shell /bin/sh gheverhan-audit
install -d -o root -g root -m 0755 "$audit_home" "$audit_home/.ssh"
install -o root -g root -m 0755 "$collector" "$audit_program"
install -o root -g root -m 0440 "$temporary" "$sudoers"
printf 'restrict,command="sudo -n /usr/local/sbin/gheverhan-capacity-audit" %s\n' "$public_key" > "$audit_home/.ssh/authorized_keys"
chown root:root "$audit_home/.ssh/authorized_keys"
chmod 0644 "$audit_home/.ssh/authorized_keys"
echo 'Installed separate forced-command audit identity. No deploy key or app configuration changed.'
echo 'Store the private counterpart ONLY as environment secret HELI_POD_AUDIT_KEY_B64.'
printf 'HELI_POD_AUDIT_COLLECTOR_SHA256=%s\n' "$2"
echo 'Pin the existing VPS host key independently; do not trust an unauthenticated ssh-keyscan.'
