#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo "Run this installer with sudo." >&2
  exit 77
fi

SOURCE_DIR=/opt/gheverhan/source
DEPLOY_DIR=/opt/gheverhan/deploy
DEPLOY_SCRIPT="$SOURCE_DIR/deploy/helipod/deploy-release.sh"
RUNTIME_HELPER_SOURCE="$SOURCE_DIR/deploy/helipod/prepare-runtime.py"
INSTALL_PATH=/usr/local/sbin/gheverhan-deploy-release
RUNTIME_HELPER_PATH=/usr/local/sbin/gheverhan-prepare-runtime.py
KEY_PATH="$DEPLOY_DIR/github-actions-deploy"
SERVER_IP=43.173.21.197

[[ -d "$SOURCE_DIR/.git" ]] || {
  echo "The Gheverhan source checkout is missing at $SOURCE_DIR." >&2
  exit 66
}
[[ -d "$DEPLOY_DIR" && -f "$DEPLOY_DIR/.env" && -f "$DEPLOY_DIR/compose.yml" ]] || {
  echo "The production deploy directory or environment file is missing." >&2
  exit 66
}

# Bring only the clean VPS checkout forward to main; never discard local edits.
if [[ -n "$(sudo -u ubuntu git -C "$SOURCE_DIR" status --porcelain)" ]]; then
  echo "The source checkout has local edits; commit or move them before bootstrapping." >&2
  exit 65
fi
sudo -u ubuntu git -C "$SOURCE_DIR" fetch origin main
sudo -u ubuntu git -C "$SOURCE_DIR" merge --ff-only origin/main
[[ -f "$DEPLOY_SCRIPT" && -f "$RUNTIME_HELPER_SOURCE" ]] || {
  echo "The merged deployment scripts are missing." >&2
  exit 66
}

install -o root -g root -m 0755 "$DEPLOY_SCRIPT" "$INSTALL_PATH"
install -o root -g root -m 0755 "$RUNTIME_HELPER_SOURCE" "$RUNTIME_HELPER_PATH"

if [[ ! -f "$KEY_PATH" && ! -f "$KEY_PATH.pub" ]]; then
  umask 077
  ssh-keygen -q -t ed25519 -N "" -C "github-actions-gheverhan-deploy" -f "$KEY_PATH"
elif [[ ! -f "$KEY_PATH" || ! -f "$KEY_PATH.pub" ]]; then
  echo "An incomplete deploy-key pair exists at $KEY_PATH; inspect it manually." >&2
  exit 65
fi
chown root:root "$KEY_PATH" "$KEY_PATH.pub"
chmod 0600 "$KEY_PATH"
chmod 0644 "$KEY_PATH.pub"

UBUNTU_HOME="$(getent passwd ubuntu | cut -d: -f6)"
[[ -n "$UBUNTU_HOME" && "$UBUNTU_HOME" == /home/* ]] || {
  echo "Could not safely resolve the ubuntu account home directory." >&2
  exit 66
}
install -d -o ubuntu -g ubuntu -m 0700 "$UBUNTU_HOME/.ssh"
AUTHORIZED_KEYS="$UBUNTU_HOME/.ssh/authorized_keys"
touch "$AUTHORIZED_KEYS"
chown ubuntu:ubuntu "$AUTHORIZED_KEYS"
chmod 0600 "$AUTHORIZED_KEYS"
PUBLIC_KEY="$(cat "$KEY_PATH.pub")"
if ! grep -Fq -- "$PUBLIC_KEY" "$AUTHORIZED_KEYS"; then
  printf 'command="sudo -n %s",no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc,no-X11-forwarding %s\n' \
    "$INSTALL_PATH" "$PUBLIC_KEY" >> "$AUTHORIZED_KEYS"
fi

HOST_KEY_FILE=/etc/ssh/ssh_host_ed25519_key.pub
[[ -r "$HOST_KEY_FILE" ]] || {
  echo "The VPS Ed25519 host public key is missing." >&2
  exit 66
}
HOST_KEY="$(cat "$HOST_KEY_FILE")"

echo "Autodeploy SSH access is installed with a forced command and forwarding disabled."
echo "Copy these values into the repository settings after this script finishes."
printf 'HELI_POD_DEPLOY_KEY_B64='
base64 -w0 "$KEY_PATH"
printf '\n'
printf 'HELI_POD_SSH_KNOWN_HOSTS=%s %s\n' "$SERVER_IP" "$HOST_KEY"
