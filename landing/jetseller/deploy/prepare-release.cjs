// Local artifact preparation only. No network, SSH, Docker or Caddy mutation.
const { execFileSync } = require('node:child_process');
const { mkdirSync, writeFileSync, existsSync } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');
const repository = path.resolve(__dirname, '../../..');
function prepare(sha, destination) {
  if (!/^[a-f0-9]{40}$/.test(sha ?? '') || !destination || !path.isAbsolute(destination)) throw new Error('Full reviewed commit SHA and absolute new output directory required');
  const git = args => execFileSync('git', ['-C', repository, ...args], { maxBuffer: 16 * 1024 * 1024 });
  if (git(['rev-parse', sha + '^{commit}']).toString().trim() !== sha) throw new Error('Commit unavailable');
  const prefix = 'landing/jetseller/';
  const files = ['index.html', '404.html', 'daftar/index.html', 'masuk/index.html', 'assets/css/main.css', 'assets/css/refactor.css', 'assets/js/main.js', 'assets/js/portal-entry.js', 'portal-config.json', 'assets/img/favicon.svg', 'assets/img/apple-touch-icon.png', 'assets/img/hero-self-hosted.svg', 'assets/img/icons/step-register.svg', 'assets/img/icons/step-launch.svg'];
  const output = path.join(destination, sha);
  if (existsSync(output)) throw new Error('Output already exists; never overwrite a release');
  const contents = files.map(file => [file, git(['show', sha + ':' + prefix + file])]);
  const references = contents.filter(([file]) => file.endsWith('.html')).flatMap(([, bytes]) => [...bytes.toString().matchAll(/(?:src|href)="(\/assets\/[^"?]+)(?:\?[^" ]*)?"/g)].map(match => match[1].slice(1)));
  if (references.some(file => !files.includes(file))) throw new Error('Unpackaged public asset');
  mkdirSync(output, { recursive: true });
  const manifest = { product: 'Buat Toko Online Sendiri', commit: sha, canonical_origin: 'https://buattokosendiri.web.id', deployment: 'NOT_DEPLOYED', files: [] };
  for (const [file, bytes] of contents) {
    mkdirSync(path.dirname(path.join(output, file)), { recursive: true });
    writeFileSync(path.join(output, file), bytes, { flag: 'wx' });
    manifest.files.push({ file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  writeFileSync(path.join(output, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return manifest;
}
module.exports = { prepare };
if (require.main === module) {
  try { console.log(JSON.stringify(prepare(process.argv[2], process.argv[3]), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
