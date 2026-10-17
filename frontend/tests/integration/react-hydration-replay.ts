import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

// Isolated synthetic SSR/client fixture. No Next server, auth, or database.
// Uses the actual App Router React runtime, not React 18 from unit tests.
async function main() {
const require = createRequire(import.meta.url);
const patch = require('../../scripts/webpack/react-runtime-backports-loader.cjs').applyRuntimeBackports as (source: string) => string;
const unpatched = process.env.R19_COMPARE_UNPATCHED === '1';
const artifacts = process.env.SPRINT1_ARTIFACT_DIR || `/tmp/react-hydration-replay-${process.pid}`;
await mkdir(artifacts, { recursive: true });
const bundle = await build({
  stdin: { contents: `
    import * as React from 'react';
    import { hydrateRoot } from 'react-dom/client';
    window.hydrationErrors = [];
    // Resolves in a microtask after the HostComponent has claimed <main>.
    const lazyContent = React.lazy(() => {
      // Flight chunks expose a status, unlike an ordinary uninstrumented
      // Promise. React uses it to replay instead of unwinding the host fiber.
      const chunk = Promise.resolve({ default: 'fixture value' });
      chunk.status = 'pending';
      chunk.then(value => { chunk.status = 'fulfilled'; chunk.value = value; });
      return chunk;
    });
    function App() {
      React.useEffect(() => { window.hydrationHarnessReady = true; }, []);
      return React.createElement('main', { className: 'hydration-fixture' }, lazyContent);
    }
    React.startTransition(() => hydrateRoot(document.getElementById('fixture-root'), React.createElement(App), {
      onRecoverableError(error) { window.hydrationErrors.push({ message:error.message, stack:error.stack }); }
    }));
  `, resolveDir: process.cwd(), sourcefile: 'hydration-replay-fixture.js' },
  bundle: true, write: false, format: 'iife', platform: 'browser',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'pinned-app-router-runtime', setup(bundler) {
    const aliases: Record<string, string> = {
      react: 'next/dist/compiled/react', 'react-dom': 'next/dist/compiled/react-dom',
      'react-dom/client': 'next/dist/compiled/react-dom/client', scheduler: 'next/dist/compiled/scheduler',
    };
    bundler.onResolve({ filter: /^(react|react-dom|react-dom\/client|scheduler)$/ }, args => ({ path: require.resolve(aliases[args.path]) }));
    bundler.onLoad({ filter: /react-dom-client\.production\.js$/ }, async args => {
      const source = await readFile(args.path, 'utf8');
      return { contents: unpatched ? source : patch(source), loader: 'js' };
    });
  } }],
});
const browser = await chromium.launch({ executablePath: process.env.SPRINT1_CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--no-sandbox'] });
const result: { status: string; unpatched: boolean; browser: string; errors?: unknown; html?: string } = { status: 'FAILED', unpatched, browser: browser.version() };
try {
  const page = await browser.newPage();
  await page.setContent('<div id="fixture-root"><main class="hydration-fixture">fixture value</main></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await expect.poll(() => page.evaluate(() => (window as unknown as { hydrationHarnessReady?: boolean }).hydrationHarnessReady === true)).toBe(true);
  result.errors = await page.evaluate(() => (window as unknown as { hydrationErrors: unknown[] }).hydrationErrors);
  result.html = await page.locator('#fixture-root').innerHTML();
  assert.deepEqual(result.errors, [], 'lazy Flight content must hydrate without recoverable #418');
  assert.equal(result.html, '<main class="hydration-fixture">fixture value</main>');
  result.status = 'PASS';
} finally {
  await writeFile(path.join(artifacts, 'hydration-replay-results.json'), JSON.stringify(result, null, 2));
  await browser.close();
}

}
main().catch(error => { console.error(error); process.exitCode = 1; });
