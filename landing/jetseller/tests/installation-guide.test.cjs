const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const landing = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const guide = fs.readFileSync(path.join(root, 'panduan-instalasi/index.html'), 'utf8');

test('step 3 and 4 point to the local installation guide', () => {
  assert.match(landing, /Dapatkan Panduan Instalasi[\s\S]*?href="\/panduan-instalasi\/"/);
  assert.match(landing, /Instal Aplikasi Secara Mandiri[\s\S]*?href="\/panduan-instalasi\/"/);
  assert.doesNotMatch(landing, /panduan instalasi akan tersedia menyusul/i);
});

test('guide includes truthful installer and go-live gates', () => {
  for (const required of ['Ubuntu', '24.04', 'git clone https://github.com/Assyauq26/buattokoonline.git', 'sudo bash install.sh', 'ssh -L 8787:127.0.0.1:8787', 'DNS', 'HTTPS', 'OTP', 'checkout', 'update.sh --check']) {
    assert.ok(guide.includes(required), 'Missing: ' + required);
  }
  assert.match(guide, /tidak otomatis membuat VPS atau toko/i);
  assert.match(guide, /jangan aktifkan J&T bila tarif atau mapping belum valid/i);
});
