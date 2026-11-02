import { readFile } from 'node:fs/promises';

const assets = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/assets/app.js', ['public/app.js', 'text/javascript; charset=utf-8']],
  ['/assets/styles.css', ['public/styles.css', 'text/css; charset=utf-8']],
]);

/** Same-origin static surface only; backend retains ownership of all /api routes. */
export async function serveDashboard(request, response) {
  if (!['GET', 'HEAD'].includes(request.method)) return false;
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const asset = assets.get(pathname);
  if (!asset) return false;
  const content = await readFile(new URL(asset[0], import.meta.url));
  response.writeHead(200, {
    'Content-Type': asset[1], 'Content-Length': content.length, 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  response.end(request.method === 'HEAD' ? undefined : content);
  return true;
}
