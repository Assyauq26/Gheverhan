const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'deploy/activate-static-landing.sh'), 'utf8');
const packager = fs.readFileSync(path.join(root, 'deploy/prepare-release.cjs'), 'utf8');

test('static activation helper has valid Bash syntax and no CI/PR dependencies', () => {
  const result = spawnSync('bash', ['-n'], {input: script, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(script, /verify\.yml|pull_request|pr_number|GITHUB_TOKEN/);
  assert.match(script, /landing\/buattokosendiri/);
  assert.match(script, /tar -tzf/);
  assert.match(script, /SWAPPED=1/);
});
test('packager includes public documentation and excludes internal trees', () => {
  assert.match(packager, /panduan-instalasi\//);
  assert.match(packager, /release-manifest\.json/);
  assert.doesNotMatch(packager, /publicDirectories = .*tests\//);
});
