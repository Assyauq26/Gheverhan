#!/usr/bin/env bash
# Real constrained guest, not a Docker cgroup pretending to be a 2GiB VPS.
# Runs only on a disposable Ubuntu CI host. It never connects to Tencent or
# Gheverhan, reads local SSH configuration, or touches the host Docker daemon.
set -euo pipefail
umask 077
[[ "${P0_DISPOSABLE_CI_CONFIRM:-}" = only-disposable-ci && "${GITHUB_ACTIONS:-}" = true ]] || { echo "Disposable CI confirmation required" >&2; exit 2; }
repo=$(git rev-parse --show-toplevel)
payload=$(realpath "${1:?absolute prebuilt payload directory required}")
[[ "$payload" = /* && -d "$payload" && ! -L "$payload" ]] || exit 2
[[ -f "$payload/resource-probe.test" && ! -L "$payload/resource-probe.test" ]] || exit 2
[[ -z "$(find "$payload" -type l -print -quit)" ]] || { echo 'Payload symlinks refused' >&2; exit 2; }
[[ "$(id -u)" != 0 && "$(uname -s)" = Linux ]] || { echo 'Disposable Ubuntu CI user required' >&2; exit 2; }
fixture=$(mktemp -d /tmp/buattokosendiri-p0-vm.XXXXXXXX)
evidence="$fixture/evidence"; mkdir -m 700 "$evidence"
echo "P0_VM_EVIDENCE=$evidence"
sudo apt-get update -qq
sudo apt-get install -y -qq qemu-system-x86 qemu-utils cloud-image-utils ubuntu-cloudimage-keyring gnupg ca-certificates curl acl >/dev/null
base='https://cloud-images.ubuntu.com/noble/current'
for file in SHA256SUMS SHA256SUMS.gpg noble-server-cloudimg-amd64.img; do
  curl --fail --location --proto '=https' --tlsv1.2 --connect-timeout 20 --max-time 600 --retry 2 "$base/$file" --output "$fixture/$file"
done
gpgv --keyring /usr/share/keyrings/ubuntu-cloudimage-keyring.gpg "$fixture/SHA256SUMS.gpg" "$fixture/SHA256SUMS" 2>"$evidence/ubuntu-signature.txt"
awk '$2=="*noble-server-cloudimg-amd64.img" || $2=="noble-server-cloudimg-amd64.img" { print }' "$fixture/SHA256SUMS" > "$fixture/selected-sum"
[[ $(wc -l < "$fixture/selected-sum") = 1 ]] || exit 2
(cd "$fixture" && sha256sum --check selected-sum) > "$evidence/ubuntu-checksum.txt"
cp "$fixture/selected-sum" "$evidence/ubuntu-image-sha256.txt"
qemu-img create -q -f qcow2 -F qcow2 -b "$fixture/noble-server-cloudimg-amd64.img" "$fixture/guest.qcow2"
qemu-img resize -q "$fixture/guest.qcow2" 40000000000
ssh-keygen -q -t ed25519 -N '' -f "$fixture/client-key"
ssh-keygen -q -t ed25519 -N '' -f "$fixture/guest-host-key"
id=$(python3 -c 'import secrets;print(secrets.token_hex(16))')
python3 - "$fixture" "$id" <<'PY'
import pathlib,sys
root=pathlib.Path(sys.argv[1])
private=(root/'guest-host-key').read_text()
public=(root/'guest-host-key.pub').read_text().strip()
client=(root/'client-key.pub').read_text().strip()
config='''#cloud-config
hostname: p0-resource-fixture
manage_etc_hosts: true
ssh_pwauth: false
disable_root: true
ssh_authorized_keys:
  - '''+client+'''
ssh_keys:
  ed25519_public: '''+public+'''
  ed25519_private: |
'''+''.join('    '+line+'\n' for line in private.splitlines())
(root/'user-data').write_text(config)
(root/'meta-data').write_text('instance-id: p0-'+sys.argv[2]+'\nlocal-hostname: p0-resource-fixture\n')
PY
cloud-localds "$fixture/seed.img" "$fixture/user-data" "$fixture/meta-data"
port=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')
read -r keytype keyvalue _ < "$fixture/guest-host-key.pub"
printf '[127.0.0.1]:%s %s %s\n' "$port" "$keytype" "$keyvalue" > "$fixture/known_hosts"
if [[ -c /dev/kvm && ( ! -r /dev/kvm || ! -w /dev/kvm ) ]]; then sudo setfacl -m "u:$(id -u):rw" /dev/kvm; fi
accel=( -accel tcg,thread=multi -cpu max )
if [[ -r /dev/kvm && -w /dev/kvm ]]; then accel=( -accel kvm -cpu host ); fi
qemu-system-x86_64 -machine q35 "${accel[@]}" -smp 2 -m 2048 \
  -drive "file=$fixture/guest.qcow2,if=virtio,format=qcow2" \
  -drive "file=$fixture/seed.img,if=virtio,format=raw,readonly=on" \
  -netdev "user,id=net0,hostfwd=tcp:127.0.0.1:$port-:22" -device virtio-net-pci,netdev=net0 \
  -device virtio-rng-pci -display none -serial "file:$evidence/guest-serial.log" -monitor none -no-reboot >"$evidence/qemu.log" 2>&1 &
qemu_pid=$!
cleanup() {
  # Terminate only this owned QEMU process. Disk/DB/media artifacts are retained
  # until the disposable CI runner itself is destroyed.
  if kill -0 "$qemu_pid" 2>/dev/null; then kill -TERM "$qemu_pid"; wait "$qemu_pid" || true; fi
}
trap cleanup EXIT
ssh_flags=( -F /dev/null -i "$fixture/client-key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$fixture/known_hosts" -o ConnectTimeout=4 -o ServerAliveInterval=10 -o ServerAliveCountMax=3 )
guest() { ssh "${ssh_flags[@]}" -p "$port" ubuntu@127.0.0.1 "$@"; }
guest_ready=0
collect_evidence() {
  [[ "$guest_ready" = 1 ]] || return 0
  guest 'sudo -n touch /root/p0-monitor-finished' >/dev/null 2>&1 || true
  sleep 3
  # Whitelist resource records only. Never archive cloud-init seed, SSH keys,
  # installer credential/state directories, raw runtime config or DB passwords.
  guest 'sudo -n python3 -c '\''import pathlib,sys,tarfile;root=pathlib.Path("/root");names=["p0-resource-evidence.json","p0-resource-samples.jsonl","p0-monitor.log","p0-resource-stop.json"];out=tarfile.open(fileobj=sys.stdout.buffer,mode="w|");[out.add(root/name,arcname=name) for name in names if (root/name).is_file()];out.close()'\''' | tar -xf - -C "$evidence" || true
}
trap 'collect_evidence; cleanup' EXIT
boot_start=$SECONDS
for attempt in $(seq 1 180); do
  if guest 'true' 2>/dev/null; then break; fi
  kill -0 "$qemu_pid" 2>/dev/null || { echo 'Disposable guest stopped before SSH' >&2; exit 1; }
  [[ "$attempt" != 180 ]] || { echo 'Disposable guest boot deadline exceeded' >&2; exit 1; }
  sleep 3
done
guest 'sudo -n cloud-init status --wait >/dev/null'
guest_ready=1
boot_seconds=$((SECONDS-boot_start))
guest "sudo -n install -d -m700 /opt/p0-payload; printf '%s\n' '$id' | sudo -n tee /run/p0-ci-fixture >/dev/null"
tar -C "$payload" -cf - . | guest 'sudo -n tar -xf - -C /opt/p0-payload; sudo -n chown -R root:root /opt/p0-payload; sudo -n chmod 700 /opt/p0-payload/resource-probe.test'
scp "${ssh_flags[@]}" -P "$port" "$repo/deploy/self-hosted/tests/p0-vm-monitor.py" ubuntu@127.0.0.1:/home/ubuntu/p0-vm-monitor.py >/dev/null
guest 'sudo -n install -m600 /home/ubuntu/p0-vm-monitor.py /root/p0-vm-monitor.py; sudo -n sh -c "nohup python3 /root/p0-vm-monitor.py >/root/p0-monitor.log 2>&1 &"'
guest 'sudo -n bash -s' <<'GUEST'
set -euo pipefail
umask 077
export DEBIAN_FRONTEND=noninteractive
test "$(hostname)" = p0-resource-fixture
test -s /run/p0-ci-fixture
apt-get update -qq
apt-get install -y -qq ca-certificates curl >/dev/null
install -m0755 -d /etc/apt/keyrings
curl --fail --proto '=https' --tlsv1.2 --connect-timeout 20 --max-time 120 https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
cat >/etc/apt/sources.list.d/docker.sources <<'DOCKER'
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Architectures: amd64
Signed-By: /etc/apt/keyrings/docker.asc
DOCKER
apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
systemctl enable --now docker
test -z "$(docker --host unix:///var/run/docker.sock ps --all --quiet)"
P0_RESOURCE_PROBE=isolated-2-2-40-fixture /opt/p0-payload/resource-probe.test -test.run '^TestP0RealHostEvidence$' -test.v
GUEST
callback_seconds=0; callback_present=0; result=0
if [[ "${P0_FULL_SELLER_E2E:-}" = 1 ]]; then
 callback_present=1; callback_start=$SECONDS
 P0_VM_SSH_PORT="$port" P0_VM_SSH_KEY="$fixture/client-key" P0_VM_KNOWN_HOSTS="$fixture/known_hosts" P0_VM_EVIDENCE_DIR="$evidence" node "$repo/deploy/self-hosted/tests/full-seller-driver.mjs" >"$evidence/full-seller.log" 2>&1 || result=$?
 callback_seconds=$((SECONDS-callback_start))
fi

if [[ -f "$repo/deploy/self-hosted/tests/p0-guest-integration.sh" ]]; then
  callback_present=1
  scp "${ssh_flags[@]}" -P "$port" "$repo/deploy/self-hosted/tests/p0-guest-integration.sh" ubuntu@127.0.0.1:/home/ubuntu/p0-guest-integration.sh >/dev/null
  guest 'sudo -n install -m700 /home/ubuntu/p0-guest-integration.sh /root/p0-guest-integration.sh'
  callback_start=$SECONDS
  guest 'sudo -n setsid bash -c '\''echo $$ >/root/p0-callback.pid; exec bash /root/p0-guest-integration.sh'\''' >"$evidence/guest-integration.log" 2>&1 || result=$?
  callback_seconds=$((SECONDS-callback_start))
fi
guest 'sudo -n touch /root/p0-monitor-finished; sudo -n test ! -f /root/p0-resource-stop.json' || result=1
collect_evidence
guest 'sudo -n docker --host unix:///var/run/docker.sock version --format "{{json .}}"' > "$evidence/docker-version.json" || true
guest 'sudo -n docker --host unix:///var/run/docker.sock stats --no-stream --format "{{json .}}"' > "$evidence/docker-final-stats.jsonl" || true
guest 'sudo -n docker --host unix:///var/run/docker.sock inspect --format "{{.Name}} {{.State.OOMKilled}} {{.RestartCount}}" $(sudo -n docker --host unix:///var/run/docker.sock ps --all --quiet)' > "$evidence/docker-final-state.txt" || true
python3 - "$evidence" "$boot_seconds" "$callback_seconds" "$result" "$callback_present" <<'PY'
import json,pathlib,sys
root=pathlib.Path(sys.argv[1]);samples=[json.loads(line) for line in (root/'p0-resource-samples.jsonl').read_text().splitlines()]
summary={'evidence':'ISOLATED_QEMU_GUEST_NOT_PUBLIC_VPS','vcpus':2,'allocated_memory_bytes':2*1024**3,'virtual_disk_bytes':40_000_000_000,'boot_seconds':int(sys.argv[2]),'callback_seconds':int(sys.argv[3]),'callback_exit':int(sys.argv[4]),'callback_present':sys.argv[5]=='1','sample_count':len(samples),'oom_kills':max((s['oom_kills_since_start'] for s in samples),default=0),'max_swap_used_bytes':max((s['swap_used_bytes'] for s in samples),default=0),'max_swap_available_bytes':max((s['swap_total_bytes'] for s in samples),default=0),'min_available_memory_bytes':min((s['mem_available_bytes'] for s in samples),default=0),'min_disk_free_bytes':min((s['disk_free_bytes'] for s in samples),default=0),'installation_result':'CALLBACK_RESULT_ONLY; NOT_PUBLIC_VPS' if sys.argv[5]=='1' else 'NOT_TESTED; RESOURCE_PREFLIGHT_ONLY'}
(root/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary))
PY
exit "$result"
