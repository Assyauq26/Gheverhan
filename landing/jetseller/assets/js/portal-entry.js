/* Read-only public capability check; no fallback accounts or credentials. */
(function () {
  'use strict';
  const portal = 'https://dashboard.buattokosendiri.web.id';
  function resolvePortalEntry(config, status, action) {
    if (config?.enabled !== true || config.portal_origin !== portal || status?.configured !== true || status.method !== 'email_otp') return null;
    const path = action === 'register' ? '/daftar' : action === 'login' ? '/masuk' : null;
    const field = action === 'register' ? 'registration_url' : 'login_url';
    if (!path || status[field] !== path) return null;
    return portal + path;
  }
  async function mountPortalEntry(document, fetcher, navigate) {
    const action = document.body.dataset.portalAction;
    const message = document.getElementById('portal-entry-status');
    const link = document.getElementById('portal-entry-link');
    if (!message || !link || !['register', 'login'].includes(action)) return;
    link.hidden = true; link.removeAttribute('href');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const settings = await fetcher('/portal-config.json', { credentials: 'omit', mode: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal });
      if (!settings.ok) throw new Error('Unavailable configuration');
      const config = await settings.json();
      if (config.enabled !== true || config.portal_origin !== portal) return;
      message.textContent = 'Memeriksa layanan akun portal…';
      const result = await fetcher(portal + '/auth/status', { credentials: 'omit', mode: 'cors', cache: 'no-store', redirect: 'error', signal: controller.signal });
      if (!result.ok) throw new Error('Unavailable portal');
      const destination = resolvePortalEntry(config, await result.json(), action);
      if (!destination) throw new Error('Unavailable account capability');
      link.href = destination; link.hidden = false;
      message.textContent = 'Layanan akun tersedia. Anda akan melanjutkan ke portal seller yang terpisah dari toko demo.';
      if (config.auto_redirect === true) navigate(destination);
    } catch {
      message.textContent = 'Layanan akun belum dapat dikonfirmasi. Coba kembali nanti; tidak ada akun sementara yang dibuat.';
    } finally { clearTimeout(timeout); }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { resolvePortalEntry, mountPortalEntry };
  if (typeof document !== 'undefined') void mountPortalEntry(document, fetch.bind(globalThis), url => window.location.replace(url));
})();
