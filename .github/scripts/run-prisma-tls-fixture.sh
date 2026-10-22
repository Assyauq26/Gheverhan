#!/usr/bin/env bash
# Disposable loopback-only PostgreSQL 17.6, no Production bindings or migrations.
set -euo pipefail
umask 077
fixture_dir=$(mktemp -d)
fixture_container="gheverhan-prisma-tls-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
cleanup() {
  docker rm -f "$fixture_container" >/dev/null 2>&1 || true
  rm -rf "$fixture_dir"
}
trap cleanup EXIT
for ca_name in ca wrong-ca; do
  openssl req -x509 -newkey rsa:2048 -nodes -keyout "$fixture_dir/$ca_name.key" -out "$fixture_dir/$ca_name.pem" -days 2 -subj "/CN=Disposable $ca_name" -addext 'basicConstraints=critical,CA:TRUE' >/dev/null 2>&1
done
openssl req -newkey rsa:2048 -nodes -keyout "$fixture_dir/server.key" -out "$fixture_dir/server.csr" -subj '/CN=localhost' >/dev/null 2>&1
printf '%s\n' 'subjectAltName=DNS:localhost' 'basicConstraints=CA:FALSE' 'extendedKeyUsage=serverAuth' > "$fixture_dir/server.ext"
openssl x509 -req -in "$fixture_dir/server.csr" -CA "$fixture_dir/ca.pem" -CAkey "$fixture_dir/ca.key" -CAcreateserial -out "$fixture_dir/server.pem" -days 2 -extfile "$fixture_dir/server.ext" >/dev/null 2>&1
# Public fixture password, never a Production credential. Image manifest pinned.
docker create --name "$fixture_container" -p 127.0.0.1::5432 \
  -e POSTGRES_USER=tls_fixture -e POSTGRES_PASSWORD=only-disposable-tls-fixture \
  -e POSTGRES_DB=gheverhan_tls_probe_test \
  -e 'POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust' \
  --entrypoint sh \
  postgres:17.6-bookworm@sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3 \
  -c 'chown postgres:postgres /tmp/server.key /tmp/server.pem; chmod 600 /tmp/server.key; exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/tmp/server.pem -c ssl_key_file=/tmp/server.key' >/dev/null
docker cp "$fixture_dir/server.key" "$fixture_container:/tmp/server.key"
docker cp "$fixture_dir/server.pem" "$fixture_container:/tmp/server.pem"
docker start "$fixture_container" >/dev/null
ready=0
for attempt in {1..40}; do
  if docker exec "$fixture_container" pg_isready -h 127.0.0.1 -U tls_fixture -d gheverhan_tls_probe_test >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
test "$ready" = 1 || { echo 'BLOCKED: disposable TLS fixture startup'; exit 1; }
binding=$(docker port "$fixture_container" 5432/tcp)
fixture_port=${binding##*:}
[[ "$fixture_port" =~ ^[0-9]+$ ]] || exit 1
GHEVERHAN_ISOLATED_TESTS=1 \
PRISMA_TLS_TEST_URL="postgresql://tls_fixture:only-disposable-tls-fixture@localhost:$fixture_port/gheverhan_tls_probe_test?sslmode=require&sslaccept=strict&connect_timeout=2" \
PRISMA_TLS_TEST_CA_FILE="$fixture_dir/ca.pem" \
PRISMA_TLS_TEST_WRONG_CA_FILE="$fixture_dir/wrong-ca.pem" \
node --test tests/integration/prisma-tls.test.mjs
