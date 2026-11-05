const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
test('active platform pages and artwork carry only the official product identity', () => {
  for (const file of ['landing/jetseller/index.html', 'landing/jetseller/404.html', 'landing/jetseller/masuk/index.html', 'landing/jetseller/daftar/index.html', 'platform/installer-web/public/index.html', 'landing/jetseller/assets/img/hero-self-hosted.svg', 'landing/jetseller/assets/img/favicon.svg']) {
    const content = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(content, /jetseller|>Jet<|>Seller</i, file);
    if (!file.endsWith('hero-self-hosted.svg')) assert.match(content, /Buat Toko Online Sendiri/, file);
  }
  const landing = fs.readFileSync(path.join(root, 'landing/jetseller/index.html'), 'utf8');
  assert.match(landing, /<h1[^>]*>Punya Toko Online Sendiri<\/h1>/);
  assert.doesNotMatch(landing, /10 menit|Coba Gratis|Daftar Gratis|Langsung Live|hero-desktop\.png/);
  assert.match(landing, /VPS, domain, dan layanan pihak ketiga memiliki biaya masing-masing/);
});
test('merchant identity and cryptographic compatibility remain independent', () => {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(read('frontend/src/components/appearance/context.tsx'), /<span>\{i\.name\}<\/span>/);
  assert.doesNotMatch(read('frontend/src/components/appearance/context.tsx'), /PlatformWordmark|JetSellerWordmark/);
  for (const file of ['frontend/src/modules/auth/password-reset-email.ts', 'frontend/src/modules/auth/registration-otp-email.ts', 'frontend/src/lib/self-hosted/admin-claim-view.ts']) assert.doesNotMatch(read(file), /JetSeller/);
  assert.match(read('frontend/src/lib/self-hosted/config.ts'), /sessionIssuer: "jetseller-store:"/);
  assert.match(read('platform/installer/src/auth.mjs'), /jetseller-agent-management/);
  assert.match(read('agent/internal/bootstrap/preflight.go'), /MemoryBytes < 4\*1024\*1024\*1024/);
  assert.match(read('agent/internal/bootstrap/preflight.go'), /FreeBytes < 40\*1024\*1024\*1024/);
});
