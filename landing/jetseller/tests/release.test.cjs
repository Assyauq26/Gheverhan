// Isolated filesystem simulation. Every Docker/curl call is a shell function;
// the production script is copied with its three absolute host paths redirected
// into a fresh temporary directory. Never run the actual release script here.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const bash = process.env.BASH_BIN || (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash');
const shellPath = p => process.platform === 'win32' ? p.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, d) => '/' + d.toLowerCase()) : p;
const source = fs.readFileSync(path.join(__dirname, '../deploy/release-v3-from-vps.sh'), 'utf8');
test('Bash syntax in release script and V3 operator instructions', () => {
  const guide = fs.readFileSync(path.join(__dirname, '../deploy/RELEASE-V3.md'), 'utf8');
  for (const script of [source, ...Array.from(guide.matchAll(/```bash\n([\s\S]*?)```/g), match => match[1])]) {
    const run = spawnSync(bash, ['-n'], { input: script, encoding: 'utf8' });
    assert.ifError(run.error);
    assert.equal(run.status, 0, run.stderr);
  }
});
const stub = `
id() { printf '0\\n'; }
flock() { [[ "$SCENARIO" != lock-failure ]]; }
chown() { :; }
date() { printf '20261101T000000Z\\n'; }
docker() {
  if [[ "$*" == 'inspect deploy_proxy_1 --format '* ]]; then
    case "$SCENARIO" in
      inspect-failure) return 1;;
      missing-mount) return 0;;
      unsafe-mount) printf '/\\n';;
      *) printf '%s\\n' "$FIXTURE/data";;
    esac
  elif [[ "$*" == 'exec deploy_proxy_1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile' ]]; then
    [[ "$SCENARIO" != invalid-caddy ]]
  else
    echo "FORBIDDEN Docker command: $*" >&2; return 99
  fi
}
curl() {
  local output='' url='' arg
  while (( $# )); do
    arg=$1; shift
    case "$arg" in
      -o|--output) output=$1; shift;;
      https://*) url=$arg;;
    esac
  done
  [[ "$SCENARIO" != download-failure || "$url" != *raw.githubusercontent.com* ]] || return 22
  [[ "$SCENARIO" != verify-failure || "$output" != *verify-index.html ]] || return 22
  [[ "$SCENARIO" != css-failure || "$output" != *verify-refactor.css ]] || return 22
  if [[ "$SCENARIO" == health-failure && "$url" == *api/v1/health && -d "$FIXTURE/data/landing/jetseller.prev-20261101T000000Z" ]]; then return 22; fi
  if [[ -n "$output" && "$output" != /dev/null ]]; then
    printf '%s\\n' 'new-release /assets/css/refactor.css background-size:36px 36px https://gheverhan.store' > "$output"
  fi
}
tar() {
  [[ "$SCENARIO" != backup-failure ]] || return 2
  command tar "$@"
}
mv() {
  local from=\${@: -2:1} to=\${@: -1}
  if [[ "$SCENARIO" == activation-failure && "$from" == *jetseller.new-* ]]; then return 1; fi
  if [[ "$SCENARIO" == rollback-failure && "$from" == *jetseller.new-* ]]; then return 1; fi
  if [[ "$SCENARIO" == rollback-failure && "$from" == *jetseller.prev-* ]]; then return 1; fi
  command mv "$@" || return
  if [[ "$SCENARIO" == interrupted-swap && "$to" == *jetseller.prev-* ]]; then kill -TERM "$BASHPID"; fi
}
`;

function simulate(scenario) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jetseller-release-test-'));
  const fixture = shellPath(dir);
  const live = path.join(dir, 'data/landing/jetseller');
  const host = path.join(dir, 'host');
  fs.mkdirSync(live, { recursive: true });
  fs.mkdirSync(host);
  fs.writeFileSync(path.join(live, 'index.html'), 'original-assets');
  fs.writeFileSync(path.join(host, 'Caddyfile'), 'jetseller.web.id /data/landing/jetseller');
  if (scenario === 'collision') fs.writeFileSync(path.join(dir, 'data/landing/jetseller.failed-20261101T000000Z'), 'keep');
  const script = source
    .replaceAll('/opt/gheverhan/deploy', fixture + '/host')
    .replaceAll('/run/lock/jetseller-static-deploy.lock', fixture + '/deploy.lock')
    .replaceAll('/tmp/jetseller-v3.XXXXXXXX', fixture + '/download.XXXXXXXX');
  assert.ok(!script.includes('/opt/gheverhan/deploy'));
  const scriptPath = path.join(dir, 'release.sh');
  const envPath = path.join(dir, 'mocks.sh');
  fs.writeFileSync(scriptPath, script);
  fs.writeFileSync(envPath, stub);
  try {
    const run = spawnSync(bash, [shellPath(scriptPath)], {
      encoding: 'utf8', timeout: 15000,
      env: { ...process.env, BASH_ENV: shellPath(envPath), FIXTURE: fixture, SCENARIO: scenario },
    });
    assert.ifError(run.error);
    const log = run.stdout + run.stderr;
    assert.doesNotMatch(log, /FORBIDDEN/);
    const previous = path.join(dir, 'data/landing/jetseller.prev-20261101T000000Z');
    if (scenario === 'success') {
      assert.equal(run.status, 0, log);
      assert.match(log, /SUCCESS: JetSeller V3 LIVE/);
      assert.match(fs.readFileSync(path.join(live, 'index.html'), 'utf8'), /new-release/);
      assert.equal(fs.readFileSync(path.join(previous, 'index.html'), 'utf8'), 'original-assets');
      assert.ok(fs.statSync(path.join(host, 'jetseller-landing-backup-20261101T000000Z.tgz')).size > 0);
    } else {
      assert.notEqual(run.status, 0, log);
      assert.doesNotMatch(log, /SUCCESS:/);
      if (scenario === 'rollback-failure') {
        assert.match(log, /CRITICAL: rollback incomplete/);
        assert.equal(fs.readFileSync(path.join(previous, 'index.html'), 'utf8'), 'original-assets');
      } else {
        assert.equal(fs.readFileSync(path.join(live, 'index.html'), 'utf8'), 'original-assets', log);
      }
      if (['activation-failure', 'verify-failure', 'css-failure', 'health-failure', 'interrupted-swap'].includes(scenario)) {
        assert.match(log, /ROLLBACK COMPLETED/);
      }
    }
    assert.equal(fs.readFileSync(path.join(host, 'Caddyfile'), 'utf8'), 'jetseller.web.id /data/landing/jetseller');
    if (scenario !== 'rollback-failure') {
      assert.ok(!fs.readdirSync(dir).some(name => name.startsWith('download.')), 'download directory cleaned');
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

for (const scenario of ['success', 'inspect-failure', 'missing-mount', 'unsafe-mount', 'invalid-caddy', 'lock-failure', 'download-failure', 'backup-failure', 'collision', 'activation-failure', 'verify-failure', 'css-failure', 'health-failure', 'interrupted-swap', 'rollback-failure']) {
  test(scenario, () => simulate(scenario));
}
