#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[ "${GITHUB_ACTIONS:-}" = true ]
[ "$(uname -m)" = x86_64 ]
fixture=$(mktemp -d /tmp/jetseller-harbor.XXXXXXXX)
[ -z "$(docker ps -aq --filter name=harbor-core)" ]
printf '%s\n' "$fixture" > "$RUNNER_TEMP/jetseller-harbor-path"
cd "$fixture"
for file in harbor-offline-installer-v2.15.0.tgz harbor-offline-installer-v2.15.0.tgz.sigstore.json; do
 curl --fail --location --proto '=https' --tlsv1.2 --connect-timeout 15 --max-time 240 --retry 2 --output "$file" "https://github.com/goharbor/harbor/releases/download/v2.15.0/$file"
done
curl --fail --location --proto '=https' --max-time 120 --output cosign https://github.com/sigstore/cosign/releases/download/v3.1.4/cosign-linux-amd64
sha256sum --check <<'HASHES'
c9ad1c8ea3ea2b657a29c86495afe3d7ea47dbb1cc6b4c0a4fbc5cb75d1e1ef8  harbor-offline-installer-v2.15.0.tgz
ffa1fdd160c3ee930ed28e7fd34520c4e511aab584edcbe9cec22cc7a676225e  harbor-offline-installer-v2.15.0.tgz.sigstore.json
424e2c97d0b45fd7a6b608a87f090f35633f4c23ece5f092d48bba11aaf4bbfa  cosign
HASHES
chmod 700 cosign
./cosign verify-blob --bundle harbor-offline-installer-v2.15.0.tgz.sigstore.json --certificate-identity https://github.com/goharbor/harbor/.github/workflows/publish_release.yml@refs/tags/v2.15.0 --certificate-oidc-issuer https://token.actions.githubusercontent.com harbor-offline-installer-v2.15.0.tgz
# Only verified upstream artifact is unpacked/executed. The dangerous upstream
# install.sh (contains down -v) is NEVER run. No live host or source secret exists.
tar -xzf harbor-offline-installer-v2.15.0.tgz
mkdir -m700 certs data
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 1 -subj '/CN=registry.fixture.test' -addext 'subjectAltName=DNS:registry.fixture.test' -addext 'basicConstraints=critical,CA:TRUE' -keyout certs/registry.key -out certs/registry.crt >/dev/null 2>&1
openssl rand -hex 24 > admin-password
openssl rand -hex 24 > db-password
python3 - "$fixture" <<'PY'
import pathlib,sys
r=pathlib.Path(sys.argv[1]);s=(r/'harbor/harbor.yml.tmpl').read_text().replace('hostname: reg.mydomain.com','hostname: registry.fixture.test').replace('/your/certificate/path',str(r/'certs/registry.crt')).replace('/your/private/key/path',str(r/'certs/registry.key')).replace('harbor_admin_password: Harbor12345','harbor_admin_password: '+(r/'admin-password').read_text().strip()).replace('password: root123','password: '+(r/'db-password').read_text().strip()).replace('data_volume: /data','data_volume: '+str(r/'data')).replace('location: /var/log/harbor','location: '+str(r/'logs'))
(r/'harbor/harbor.yml').write_text(s)
PY
printf '127.0.0.1 registry.fixture.test\n' | sudo tee -a /etc/hosts >/dev/null
sudo install -m0644 certs/registry.crt /usr/local/share/ca-certificates/jetseller-registry-fixture.crt
sudo update-ca-certificates >/dev/null
sudo install -d -m0755 /etc/docker/certs.d/registry.fixture.test
sudo install -m0644 certs/registry.crt /etc/docker/certs.d/registry.fixture.test/ca.crt
cd harbor
docker load -i harbor.v2.15.0.tar.gz > "$fixture/loaded-images.private.log"
./prepare > "$fixture/prepare.private.log" 2>&1
# Default project/container names are safe only on this fresh isolated CI runner.
docker compose up -d > "$fixture/startup.private.log" 2>&1
for n in $(seq 1 90); do
 if curl --noproxy '*' --silent --fail --connect-timeout 2 --max-time 5 https://registry.fixture.test/api/v2.0/ping >/dev/null; then break; fi
 sleep 2
done
curl --noproxy '*' --silent --fail https://registry.fixture.test/api/v2.0/ping >/dev/null
printf 'Verified upstream Harbor2.15 package, private disposable TLS registry running; no install.sh/down/prune executed\n'
