#!/usr/bin/env bash
set -Eeuo pipefail
trap 'echo "Local admin fixture failed at line $LINENO" >&2' ERR
umask 077
stack=${1:?fixture stack required}
case "$stack" in /tmp/jetseller-runtime.*/stack) ;; *) exit 1;; esac
test -f "$stack/.jetseller-disposable"
dc() { docker compose --project-directory "$stack" -f "$stack/compose.yml" "$@"; }
curl_setup() { curl --noproxy '*' --silent --show-error --cacert "$(dirname "$stack")/ca.pem" --resolve store.fixture.example:443:127.0.0.1 "$@"; }
url=https://store.fixture.example/admin/setup
work=$(mktemp -d /tmp/jetseller-admin-claim.XXXXXXXX)
dc exec -T app node -e "require('fs').mkdirSync('/tmp/admin-setup-private',{mode:0o700})"
issue() {
 dc exec -T app node self-hosted/issue-admin.mjs --config /run/secrets/runtime_config --out "/tmp/admin-setup-private/$1.json" >/dev/null
 # Docker archive/cp does not expose tmpfs; transfer locally into a private file, never logs.
 dc exec -T app node -e "process.stdout.write(require('fs').readFileSync(process.argv[1]))" "/tmp/admin-setup-private/$1.json" > "$work/claim.json"
 python3 - "$work" <<'PY'
import json,sys,urllib.parse,pathlib
p=pathlib.Path(sys.argv[1]); claim=json.loads((p/'claim.json').read_text())['claim']
for name,email in [('one','local-owner-one@example.test'),('two','local-owner-two@example.test'),('customer','existing-customer@example.test'),('wrong','local-owner-one@example.test')]:
 body=dict(claim='z'*43 if name=='wrong' else claim,name='Synthetic local owner',email=email,password='Synthetic-fixture-password-001',confirmation='Synthetic-fixture-password-001')
 (p/(name+'.body')).write_text(urllib.parse.urlencode(body))
(p/'login.json').write_text(json.dumps(dict(identifier='local-owner-one@example.test',password='Synthetic-fixture-password-001')))
PY
}
post() { curl_setup -H 'Origin: https://store.fixture.example' -H 'Content-Type: application/x-www-form-urlencoded' --data-binary "@$work/$1.body" -o "$work/response-$1" -w '%{http_code}' "$url"; }
issue initial
form_status=$(curl_setup -o "$work/form.html" -w '%{http_code}' "$url")
echo "Local admin HTTPS form status=$form_status"
test "$form_status" = 200
test "$(curl_setup -H 'Origin: https://attacker.example' -H 'Content-Type: application/x-www-form-urlencoded' --data-binary "@$work/one.body" -o /dev/null -w '%{http_code}' "$url")" = 403
test "$(curl_setup -H 'Content-Type: application/x-www-form-urlencoded' --data-binary "@$work/one.body" -o /dev/null -w '%{http_code}' "$url")" = 403
for attempt in $(seq 1 5); do test "$(post wrong)" = 403; done
test "$(post one)" = 429
issue expired
dc exec -T db psql -U js_bootstrap -d "$(sed -n 's/^JETSELLER_DATABASE_NAME=//p' "$stack/.env")" -v ON_ERROR_STOP=1 -c 'UPDATE "LocalAdminSetup" SET "expiresAt"=NOW()-interval '\''1 minute'\''' >/dev/null
test "$(post one)" = 410
issue fresh
dc exec -T db psql -U js_bootstrap -d "$(sed -n 's/^JETSELLER_DATABASE_NAME=//p' "$stack/.env")" -v ON_ERROR_STOP=1 -c 'INSERT INTO "User" (id,name,email,"passwordHash","isActive","updatedAt") VALUES ('\''fixture-customer'\'','\''Synthetic customer'\'','\''existing-customer@example.test'\'','\''fixture-no-login'\'',true,NOW())' >/dev/null
test "$(post customer)" = 409
post one > "$work/one.status" & one_pid=$!
post two > "$work/two.status" & two_pid=$!
wait "$one_pid" "$two_pid"
test "$(cat "$work/one.status" "$work/two.status" | fold -w3 | sort | tr '\n' ' ')" = '303 409 '
python3 - "$work" <<'PY'
import json,pathlib,sys
p=pathlib.Path(sys.argv[1]); who='one' if (p/'one.status').read_text()=='303' else 'two'
(p/'login.json').write_text(json.dumps(dict(identifier='local-owner-'+who+'@example.test',password='Synthetic-fixture-password-001')))
PY
test "$(curl_setup -H 'Origin: https://store.fixture.example' -H 'Content-Type: application/json' --data-binary "@$work/login.json" -c "$work/cookies" -o "$work/login-response.json" -w '%{http_code}' https://store.fixture.example/api/v1/auth/login)" = 200
test "$(curl_setup -b "$work/cookies" -o "$work/admin.html" -w '%{http_code}' https://store.fixture.example/admin)" = 200
# A newly activated independent store must expose a real product editor and
# stage a seller-owned image on its own local media volume.
test "$(curl_setup -b "$work/cookies" -o "$work/product-editor.html" -w '%{http_code}' https://store.fixture.example/admin/products/new)" = 200
python3 - "$work" <<'PY'
import base64,pathlib,sys,uuid
p=pathlib.Path(sys.argv[1])
(p/'product-image.png').write_bytes(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO38XOcAAAAASUVORK5CYII='))
(p/'image-request-id').write_text(str(uuid.uuid4()))
PY
image_request_id=$(cat "$work/image-request-id")
test "$(curl_setup -b "$work/cookies" -H 'Origin: https://store.fixture.example' -F "requestId=$image_request_id" -F 'purpose=gallery' -F "image=@$work/product-image.png;type=image/png" -o "$work/staged-image.json" -w '%{http_code}' https://store.fixture.example/api/v1/admin/product-media)" = 201
python3 - "$work" <<'PY'
import json,pathlib,sys,uuid
p=pathlib.Path(sys.argv[1]);resp=json.loads((p/'staged-image.json').read_text())
assert resp['success'] is True
value=resp['data'];uuid.UUID(value['id'])
assert value['url'].startswith('/api/v1/admin/product-media/')
(p/'staged-image-id').write_text(value['id'])
PY
image_id=$(cat "$work/staged-image-id")
test "$(curl_setup -b "$work/cookies" -o "$work/staged-image-read.json" -w '%{http_code}' "https://store.fixture.example/api/v1/admin/product-media?ids=$image_id")" = 200
python3 - "$work" <<'PY'
import json,pathlib,sys
p=pathlib.Path(sys.argv[1]);value=json.loads((p/'staged-image-read.json').read_text())
assert value['success'] is True and len(value['data'])==1
assert value['data'][0]['id']==(p/'staged-image-id').read_text()
PY
test "$(curl_setup -o /dev/null -w '%{http_code}' "https://store.fixture.example/api/v1/admin/product-media?ids=$image_id")" = 401
echo 'Local admin product editor and authenticated image staging/ownership PASS'
test "$(post one)" = 409
test "$(curl_setup -o /dev/null -w '%{http_code}' "$url")" = 404
counts=$(dc exec -T db psql -U js_bootstrap -d "$(sed -n 's/^JETSELLER_DATABASE_NAME=//p' "$stack/.env")" -Atc 'SELECT count(*) FROM "UserRole" u JOIN "Role" r ON r.id=u."roleId" WHERE r.name='\''Admin'\''')
test "$counts" = 1
test "$(dc exec -T db psql -U js_bootstrap -d "$(sed -n 's/^JETSELLER_DATABASE_NAME=//p' "$stack/.env")" -Atc 'SELECT "passwordHash" FROM "User" WHERE id='\''fixture-customer'\''')" = fixture-no-login
python3 - "$work" <<'PY'
import pathlib,json,sys
p=pathlib.Path(sys.argv[1]);claim=json.loads((p/'claim.json').read_text())['claim']
for f in [p/'form.html',*p.glob('response-*')]:
 text=f.read_text();assert claim not in text and 'Synthetic-fixture-password-001' not in text
PY
echo 'Local admin HTTPS/origin/expiry/rate/customer preservation/concurrent consume/replay/redaction checks PASS'
