// Standalone static frontend QA. No application, API, email or carrier credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const evidence = path.join(__dirname, 'evidence/registration');
let checks = 0;
function check(value, message) { assert(value, message); checks++; }
function content(url) {
  const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  let file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep)) return null;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  return { body: fs.readFileSync(file), contentType: file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html' };
}
const server = http.createServer((req, res) => {
  const result = content(req.url);
  res.writeHead(result ? 200 : 404, { 'Content-Type': result?.contentType || 'text/plain' });
  res.end(result?.body || 'Not found');
});
async function fillAccount(page) {
  await page.locator('#owner').fill('Seller Contoh');
  await page.locator('#email').fill('QA@example.test');
  await page.locator('#phone').fill('081234567890');
  // Synthetic fixture only. Never use actual user passwords or OTPs in this suite.
  await page.locator('#password').fill('ExampleOnly123');
  await page.locator('#confirm').fill('ExampleOnly123');
  await page.locator('#consent').check();
}
async function noOverflow(page, note) {
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow: ' + note);
}
async function capture(page, options) {
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); });
  await page.waitForFunction(() => window.scrollY === 0);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot(options);
}
(async () => {
  fs.mkdirSync(evidence, { recursive: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const errors = [], unsafeRequests = [];
  const contexts = [];
  let fontLoaded = false;
  try {
    for (const width of [360, 390, 428, 768, 1024, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } }); contexts.push(context);
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(e.message));
      page.on('request', r => {
        if (r.method() !== 'GET' || /\/api\//.test(r.url()) || /ExampleOnly123/.test(r.url())) unsafeRequests.push(r.method() + ' ' + new URL(r.url()).pathname);
      });
      await page.goto(base + '/daftar/');
      await page.locator('#registration-fields:not([disabled])').waitFor();
      await page.evaluate(() => document.fonts.ready);
      fontLoaded = await page.evaluate(() => [...document.fonts].some(f => f.family.includes('Plus Jakarta Sans') && f.status === 'loaded'));
      check(await page.locator('#local-preview').isHidden(), 'No QA controls in default UI');
      await noOverflow(page, width + ' account');
      await capture(page, { path: path.join(evidence, `account-${width}.png`), fullPage: true });
      await page.locator('#next').click();
      check(await page.locator('#owner').getAttribute('aria-invalid') === 'true', 'Required owner');
      check(await page.locator('#owner').evaluate(el => el === document.activeElement), 'First error focused');
      await fillAccount(page);
      await page.locator('#password').fill('weak');
      await page.locator('#next').click();
      check(await page.locator('#password').getAttribute('aria-invalid') === 'true', 'Weak password rejected');
      await fillAccount(page);
      await page.locator('#owner').focus();
      await page.keyboard.press('Tab');
      check(await page.locator('#email').evaluate(el => el === document.activeElement), 'Keyboard progresses through labelled inputs');
      await page.keyboard.press('Shift+Tab');
      check(await page.locator('#owner').evaluate(el => el === document.activeElement), 'Reverse keyboard navigation');
      await page.locator('#email').fill('invalid-email');
      await page.locator('#phone').fill('+12025550123');
      await page.locator('#confirm').fill('Mismatch123');
      await page.locator('#consent').uncheck();
      await page.locator('#next').click();
      for (const id of ['email', 'phone', 'confirm', 'consent']) check(await page.locator('#' + id).getAttribute('aria-invalid') === 'true', id + ' rejected');
      if (width === 390 || width === 1440) await capture(page, { path: path.join(evidence, `account-error-${width}.png`), fullPage: true, mask: [page.locator('#password'), page.locator('#confirm')] });
      await fillAccount(page);
      await page.locator('[data-reveal="password"]').focus();
      await page.keyboard.press('Space');
      check(await page.locator('#password').getAttribute('type') === 'text', 'Keyboard reveals password');
      await page.keyboard.press('Space');
      check(await page.locator('#password').getAttribute('type') === 'password', 'Keyboard hides password');
      await page.locator('#next').click();
      check(await page.locator('#store-title').evaluate(el => el === document.activeElement), 'Step heading focused');
      await page.locator('#brand').fill('Ruang Róna & Co');
      check(await page.locator('#slug').inputValue() === 'ruang-rona-co', 'Automatic slug normalization');
      await page.locator('#slug').fill('custom-store');
      await page.locator('#brand').fill('Brand Baru');
      check(await page.locator('#slug').inputValue() === 'custom-store', 'User slug edit preserved');
      for (const slug of ['dashboard', 'www', 'api', 'admin', 'support', 'mail', 'static', '-bad', 'Bad Store', 'ab', 'a'.repeat(49)]) {
        await page.locator('#slug').evaluate((el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }, slug);
        await page.locator('#next').click();
        check(await page.locator('#slug').getAttribute('aria-invalid') === 'true', 'Invalid/reserved slug rejected');
      }
      await page.locator('#slug').fill('ruang-rona');
      await noOverflow(page, width + ' store');
      if (width === 390 || width === 1440) await capture(page, { path: path.join(evidence, `store-${width}.png`), fullPage: true });
      await page.locator('#previous').click();
      check(await page.locator('#owner').inputValue() === 'Seller Contoh', 'Back preserves account');
      check(Boolean(await page.locator('#password').inputValue()), 'Back preserves password in memory only');
      await page.locator('#next').click();
      await page.locator('#next').click();
      check(await page.locator('#otp').isDisabled(), 'Public OTP disabled');
      check(await page.locator('#verify').isDisabled(), 'Public verify disabled');
      check(await page.locator('#resend').isDisabled(), 'Public resend disabled');
      check(await page.locator('[data-step="4"]').isDisabled(), 'Public provisioning unreachable');
      await noOverflow(page, width + ' OTP pending');
      if (width === 390 || width === 1440) await capture(page, { path: path.join(evidence, `otp-pending-${width}.png`), fullPage: true });
      check(await page.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0 && document.cookie === ''), 'No browser persistence');
      await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide')));
      check(await page.locator('#password').inputValue() === '' && await page.locator('#confirm').inputValue() === '', 'Page exit clears sensitive values');
      await page.goto(base + '/daftar/?preview=1');
      await page.locator('#local-preview:not([hidden])').waitFor();
      for (const state of ['otp-waiting', 'otp-invalid', 'otp-expired', 'otp-resend', 'otp-loading', 'provision-loading', 'provision-success', 'provision-error']) {
        await page.locator('#preview-state').selectOption(state);
        await noOverflow(page, width + ' ' + state);
        check(await page.locator('#fixture-note').textContent().then(s => s.includes('belum membuat akun/toko')), 'Simulation clearly labelled');
        if (state.startsWith('otp-')) check(await page.locator('#verify').isDisabled(), 'No simulated verification success action');
        else check(await page.locator('#dashboard').isDisabled(), 'No fake dashboard action');
        if (state === 'otp-waiting') {
          await page.locator('#otp').evaluate(el => {
            const data = new DataTransfer(); data.setData('text', '12a34567');
            el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
          });
          check(await page.locator('#otp').inputValue() === '123456', 'Six-digit numeric paste handling');
          await page.locator('#otp').fill('');
        }
        if ((width === 390 || width === 1440) && ['otp-invalid', 'otp-expired', 'provision-loading', 'provision-success', 'provision-error'].includes(state)) {
          await capture(page, { path: path.join(evidence, `${state}-${width}.png`), fullPage: true });
        }
      }
      await page.locator('#retry-preview').click();
      check((await page.locator('#provision-status').textContent()).includes('Simulasi'), 'Retry changes UI only');
      if (width === 390) {
        await page.clock.install();
        await page.locator('#preview-state').selectOption('otp-waiting');
        await page.clock.fastForward(91000);
        check(await page.locator('#preview-state').inputValue() === 'otp-expired', 'Fixture timer expires');
        await page.locator('#resend').click();
        check(await page.locator('#preview-state').inputValue() === 'otp-resend', 'Resend changes fixture only');
        await page.locator('#preview-state').selectOption('');
        await fillAccount(page); await page.locator('#next').click();
        await page.locator('#brand').fill('Ruang Rona'); await page.locator('#next').click();
        check(await page.locator('#otp').isDisabled(), 'Leaving fixture restores pending form');
        await page.locator('.nav-toggle').click(); await page.keyboard.press('Escape');
        check(await page.locator('.nav-toggle').getAttribute('aria-expanded') === 'false', 'Mobile menu supports Escape');
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.locator('#preview-state').selectOption('provision-loading');
        check(await page.locator('.reg-spinner').evaluate(el => getComputedStyle(el).animationName === 'none'), 'Reduced motion respected');
      }
      await context.close();
    }
    const publicContext = await browser.newContext(); contexts.push(publicContext);
    await publicContext.route('http://public.jetseller.test/**', route => {
      const result = content(route.request().url());
      return route.fulfill({ status: result ? 200 : 404, body: result?.body || '', contentType: result?.contentType || 'text/plain' });
    });
    const publicPage = await publicContext.newPage();
    await publicPage.goto('http://public.jetseller.test/daftar/?preview=1');
    check(await publicPage.locator('#local-preview').isHidden(), 'Query cannot enable fixtures on public hostname');
    check(await publicPage.locator('[data-step="4"]').isDisabled(), 'Public query cannot unlock provisioning');
    const noJs = await browser.newContext({ javaScriptEnabled: false }); contexts.push(noJs);
    const noJsPage = await noJs.newPage(); await noJsPage.goto(base + '/daftar/');
    check(await noJsPage.locator('#owner').isDisabled(), 'No-JS form fails closed');
    check(await noJsPage.locator('noscript').isVisible(), 'No-JS explanation visible');
    check(errors.length === 0, 'No uncaught browser errors: ' + errors.join('; '));
    check(unsafeRequests.length === 0, 'No API, POST or sensitive URL requests: ' + unsafeRequests.join('; '));
    const result = { status: 'PASS', checks, viewports: [360, 390, 428, 768, 1024, 1440], chromium: browser.version(), node: process.version, fontLoaded,
      scope: 'static frontend only; no backend/email/tenant/domain', screenshots: fs.readdirSync(evidence).filter(n => n.endsWith('.png')) };
    fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
  } finally { for (const ctx of contexts) await ctx.close().catch(() => {}); await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
