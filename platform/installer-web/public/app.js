const API = '/api/installer/v1';
const labels = {
  DRAFT: 'Rencana instalasi', ACCOUNT_VERIFIED: 'Akun terverifikasi', AWAITING_PAIR: 'Menunggu VPS',
  PAIR_PENDING: 'Menunggu VPS', PAIRED: 'VPS terhubung', PREFLIGHT_OK: 'Pemeriksaan server selesai',
  DOMAIN_PENDING: 'Menunggu domain', TLS_READY: 'HTTPS terverifikasi', DB_READY: 'Database tersedia',
  APP_INSTALLED: 'Aplikasi terpasang', AGENT_REGISTERED: 'Agent terdaftar', INSTALLED: 'Aplikasi terpasang',
  STORE_SETUP_REQUIRED: 'Pengaturan toko diperlukan', STORE_READY_TO_SELL: 'Toko siap berjualan',
  CANCELLED: 'Dibatalkan', BLOCKED: 'Perlu tindakan', MANUAL_INTERVENTION_REQUIRED: 'Perlu bantuan teknis',
};
const explanations = {
  DRAFT: 'Rencana tersimpan. VPS belum terhubung dan aplikasi belum dipasang.',
  PAIRED: 'Identitas VPS sudah terhubung. Pairing belum membuktikan aplikasi, database, domain, atau HTTPS siap.',
  INSTALLED: 'Aplikasi sudah terpasang. Selesaikan pengaturan admin, produk, pembayaran, dan pengiriman di toko Anda.',
  APP_INSTALLED: 'Aplikasi sudah terpasang. Kesiapan berjualan tetap membutuhkan pemeriksaan terpisah.',
  STORE_SETUP_REQUIRED: 'Buka dashboard lokal toko untuk menyelesaikan konfigurasi. Jangan masukkan password admin toko ke portal ini.',
  STORE_READY_TO_SELL: 'Server melaporkan syarat berjualan telah terpenuhi. Status ini terpisah dari koneksi agent.',
};
const errors = {
  AUTH_UNAVAILABLE: 'Pengiriman kode email belum dikonfigurasi. Instalasi dan pairing belum dapat dijalankan.',
  AUTH_REQUIRED: 'Belum ada sesi seller yang sah. Gunakan kode email untuk masuk ke akun seller.',
  OTP_INVALID: 'Kode belum cocok. Periksa kode 6 digit terbaru dari email Anda.',
  OTP_EXPIRED: 'Kode sudah kedaluwarsa. Minta kode baru untuk melanjutkan.',
  PROFILE_REQUIRED: 'Lengkapi nama dan nama toko untuk membuat akun seller, lalu verifikasi email Anda.',
  EMAIL_NOT_VERIFIED: 'Verifikasi email akun terlebih dahulu, lalu muat ulang.',
  CSRF_REJECTED: 'Sesi tindakan tidak berlaku. Muat ulang sebelum mencoba kembali.',
  CSRF_INVALID: 'Sesi tindakan tidak berlaku. Muat ulang sebelum mencoba kembali.',
  RATE_LIMITED: 'Terlalu banyak percobaan. Tunggu sebentar sebelum mencoba kembali.',
  PAIR_EXPIRED: 'Kode pairing sudah kedaluwarsa. Minta kode baru dari installer pada VPS.',
  PAIR_ALREADY_USED: 'Kode pairing sudah digunakan. Muat ulang status instalasi sebelum mencoba kode baru.',
  PAIR_NOT_FOUND: 'Kode tidak ditemukan atau bukan milik instalasi Anda. Periksa kode dari terminal VPS.',
  NOT_FOUND: 'Data tidak ditemukan atau Anda tidak memiliki akses. Muat ulang daftar instalasi.',
  CONFLICT: 'Status instalasi berubah. Muat ulang untuk memeriksa kondisi terbaru.',
  INVALID_REQUEST: 'Data belum valid. Periksa isian dan coba lagi.',
  INVALID_DOMAIN: 'Domain belum valid. Gunakan domain milik Anda tanpa https:// atau alamat halaman.',
  CHALLENGE_EXPIRED: 'Instruksi TXT kedaluwarsa. Buat instruksi baru sebelum memeriksa DNS lagi.',
  CHALLENGE_REPLACED: 'Instruksi TXT sudah diganti. Muat ulang dan gunakan nilai terbaru.',
  DOMAIN_CHANGED: 'Domain berubah saat diperiksa. Muat ulang lalu buat instruksi yang sesuai.',
  INSTALLATION_EXPIRED: 'Rencana instalasi sudah tidak aktif. Perbarui rencana sebelum melanjutkan.',
  NETWORK: 'Layanan tidak dapat dihubungi. Periksa koneksi Anda, lalu coba lagi.',
};

export function statusLabel(status) { return labels[status] || 'Status belum tersedia'; }
export function safeErrorMessage(code) { return errors[code] || 'Tindakan belum berhasil. Muat ulang status sebelum mencoba kembali.'; }

export function createApi(fetcher, getCsrf, onUnauthorized = () => {}, base = API) {
  return async function request(route, { method = 'GET', body, idempotencyKey } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const headers = { Accept: 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (method !== 'GET') {
        const csrf = getCsrf();
        if (!csrf) throw Object.assign(new Error('AUTH_REQUIRED'), { code: 'AUTH_REQUIRED' });
        headers['X-CSRF-Token'] = csrf;
      }
      if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
      const response = await fetcher(base + route, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'same-origin', mode: 'same-origin', cache: 'no-store', signal: controller.signal,
      });
      let result;
      try { result = await response.json(); } catch { throw Object.assign(new Error('NETWORK'), { code: 'NETWORK' }); }
      if (!response.ok) {
        const code = typeof result?.error?.code === 'string' ? result.error.code : 'UNKNOWN';
        if (response.status === 401) onUnauthorized();
        throw Object.assign(new Error(code), { code });
      }
      return result;
    } catch (error) {
      if (error?.code) throw error;
      throw Object.assign(new Error('NETWORK'), { code: 'NETWORK' });
    } finally { clearTimeout(timer); }
  };
}

/** Passwordless account endpoints use exact Origin plus a private preauth
 * cookie. No bearer, OTP or challenge ever enters a URL/localStorage. */
export function createEmailAuth(fetcher) {
  return async (route, body) => {
    if (!['/auth/email/start','/auth/email/verify'].includes(route)) throw new Error('Invalid account route');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetcher(route, { method:'POST', headers:{Accept:'application/json','Content-Type':'application/json'}, body:JSON.stringify(body), credentials:'same-origin', mode:'same-origin', redirect:'error', cache:'no-store', signal:controller.signal });
      const result = await response.json();
      if (!response.ok) throw Object.assign(new Error('Account request refused'), { code:typeof result?.error?.code === 'string' ? result.error.code : 'UNKNOWN' });
      return result;
    } catch(error) { if (error?.code) throw error; throw Object.assign(new Error('Account service unavailable'), { code:'NETWORK' }); }
    finally { clearTimeout(timeout); }
  };
}

export function mountDashboard(document, fetcher = globalThis.fetch.bind(globalThis)) {
  const el = id => document.getElementById(id);
  let csrf = null, selected = null, pairing = null, createAttempt = null, generation = 0, detailRequest = 0;
  let domainChallenge = null, domainAttempt = null, selectedDomain = null, provisionRequest = 0;
  let emailMode = 'login', emailChallenge = null, emailGeneration = 0, resendTimer = null;
  const emailRequest = createEmailAuth(fetcher);
  const timers = document.defaultView ?? globalThis;
  const request = createApi(fetcher, () => csrf, () => clearSession());
  const authRequest = createApi(fetcher, () => null, () => {}, '');
  const text = (id, value) => { el(id).textContent = value; };
  function notice(message, tone = 'neutral') {
    text('notice-message', message); el('service-notice').dataset.tone = tone;
  }
  function clearEmailChallenge() {
    emailGeneration++; emailChallenge = null;
    if (resendTimer !== null) timers.clearTimeout(resendTimer); resendTimer = null;
    el('email-code').value = ''; el('email-verify-form').hidden = true; el('email-start-form').hidden = false;
    el('email-resend').disabled = true; text('email-auth-status', ''); el('email-auth-error').hidden = true;
  }
  function setEmailMode(mode) {
    clearEmailChallenge(); emailMode = mode;
    const registration = mode === 'register';
    text('email-auth-heading', registration ? 'Buat akun seller' : 'Masuk dengan email');
    el('registration-profile').hidden = !registration;
    for (const id of ['seller-name','seller-store-name']) { el(id).required = registration; el(id).disabled = !registration; }
    el('auth-toggle-login').setAttribute('aria-pressed', String(!registration)); el('auth-toggle-register').setAttribute('aria-pressed', String(registration));
  }
  function showEmailEntry(auth) {
    const configured = auth.configured === true && auth.method === 'email_otp' && auth.login_url === '/masuk' && auth.registration_url === '/daftar';
    el('sign-in').hidden = !(configured && auth.login_url === '/masuk');
    el('register').hidden = !(configured && auth.registration_url === '/daftar');
    el('email-auth').hidden = !configured;
    if (configured) setEmailMode(new URL(document.URL).pathname === '/daftar' ? 'register' : 'login');
  }
  async function sendEmailCode() {
    const current = emailGeneration;
    const body = { mode:emailMode, email:el('seller-email').value.trim(), ...(emailMode === 'register' ? {name:el('seller-name').value.trim(),store_name:el('seller-store-name').value.trim()} : {}) };
    const result = await emailRequest('/auth/email/start', body);
    if (current !== emailGeneration) return;
    if (result.status !== 'OTP_SENT' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(result.challenge_id) || !Number.isInteger(result.expires_in) || result.expires_in < 1 || result.expires_in > 600 || !Number.isInteger(result.resend_after) || result.resend_after < 1 || result.resend_after > 600) throw Object.assign(new Error('Invalid account response'), {code:'NETWORK'});
    emailChallenge = result.challenge_id; el('email-start-form').hidden = true; el('email-verify-form').hidden = false; el('email-code').value = ''; el('email-code').focus();
    text('email-auth-status', 'Periksa email Anda. Kode berlaku ' + Math.ceil(result.expires_in / 60) + ' menit. Anda dapat meminta ulang setelah ' + result.resend_after + ' detik.');
    el('email-resend').disabled = true;
    if (resendTimer !== null) timers.clearTimeout(resendTimer);
    resendTimer = timers.setTimeout(() => { if (emailGeneration === current && emailChallenge === result.challenge_id) el('email-resend').disabled = false; }, result.resend_after * 1000);
  }
  function clearPairing() {
    pairing = null; el('pairing-confirm').hidden = true; el('confirm-device').checked = false;
    text('device-fingerprint', ''); text('device-scopes', ''); text('device-expiry', '');
  }
  function clearProvisioning() {
    provisionRequest++;
    el('installer-release').hidden = true;
    for (const id of ['installer-download','installer-signature','installer-policy','local-admin','local-products','local-storefront','activate-command']) { el(id).hidden = true; el(id).removeAttribute('href'); }
    for (const id of ['installer-release-id','installer-sha','installer-policy-sha','installer-root-sha','installer-manifest-sha','pair-command','install-command','activate-command','progress-contact','progress-error']) text(id, '');
    text('installer-status', 'Rilis installer belum tersedia. Jangan jalankan script yang belum diverifikasi.');
    text('progress-status', 'Belum ada laporan installer.'); el('progress-error').hidden = true;
    text('wizard-installer', 'Menunggu rilis'); text('wizard-progress', 'Belum dimulai');
  }
  function releaseUrl(value) {
    if (typeof value !== 'string' || value.length > 2048) throw new Error('Invalid release URL');
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Invalid release URL');
    return url.href;
  }
  function installCommands(value, location) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.installation_id) || value.control_origin !== new URL(location).origin || !value.control_origin.startsWith('https://')) throw new Error('Invalid installation command');
    const flags = ' --state /var/lib/jetseller-agent --installation-id ' + value.installation_id + ' --control-origin ' + value.control_origin;
    return { pair: 'sudo /usr/local/bin/jetseller-setup pair' + flags, install: 'sudo /usr/local/bin/jetseller-setup install' + flags + ' --policy /etc/buattokosendiri/release-policy.json --release-directory /var/lib/jetseller-agent/release --confirm-install ' + value.installation_id, activate: 'sudo /usr/local/bin/jetseller-setup activate-admin' + flags + ' --policy /etc/buattokosendiri/release-policy.json --confirm-install ' + value.installation_id };
  }
  function showInstructions(value) {
    if (value?.installation_id !== selected || value.available !== true) return;
    const hashes = ['policy_sha256','root_sha256','manifest_sha256'];
    if (typeof value.release_id !== 'string' || value.release_id.length > 120 || !/^[a-zA-Z0-9._-]+$/.test(value.release_id) || !value.installer || !/^[a-f0-9]{64}$/.test(value.installer.sha256) || hashes.some(key => !/^[a-f0-9]{64}$/.test(value[key]))) throw new Error('Invalid release metadata');
    const urls = [releaseUrl(value.installer.url), releaseUrl(value.installer.signature_url), releaseUrl(value.policy_url)];
    const commands = installCommands(value, document.URL);
    text('installer-release-id', value.release_id); text('installer-sha', value.installer.sha256); text('installer-policy-sha', value.policy_sha256); text('installer-root-sha', value.root_sha256); text('installer-manifest-sha', value.manifest_sha256);
    for (const [index, id] of ['installer-download','installer-signature','installer-policy'].entries()) { el(id).href = urls[index]; el(id).hidden = false; }
    text('pair-command', commands.pair); text('install-command', commands.install); text('activate-command', commands.activate);
    text('installer-status', 'Rilis disediakan. Selesaikan verifikasi independen sebelum menjalankan installer.');
    text('wizard-installer', 'Berkas rilis tersedia'); el('installer-release').hidden = false;
  }
  const phaseLabels = { NOT_STARTED:'Belum dimulai', PREFLIGHT:'Memeriksa VPS', VERIFIED_RELEASE:'Manifest rilis diverifikasi', DATABASE:'Menyiapkan PostgreSQL', MIGRATION:'Menjalankan migrasi', APPLICATION:'Memasang aplikasi', HTTPS_PENDING:'Menunggu HTTPS', LOCAL_READINESS:'Readiness lokal dilaporkan', FAILED:'Pemasangan memerlukan tindakan' };
  function showProgress(value) {
    if (value?.installation_id !== selected || !Object.hasOwn(phaseLabels, value.phase) || !Number.isSafeInteger(value.sequence) || value.sequence < 0) throw new Error('Invalid progress');
    const label = phaseLabels[value.phase]; text('progress-status', label); text('wizard-progress', label);
    text('progress-contact', value.updated_at ? 'Laporan agent: ' + timestamp(value.updated_at) : 'Belum ada laporan agent.');
    if (value.phase === 'FAILED') { text('progress-error', 'Installer dihentikan dengan aman. Periksa diagnostik lokal di VPS; data toko tidak dihapus.'); el('progress-error').hidden = false; }
    if (value.phase !== 'LOCAL_READINESS' || !selectedDomain || value.store_origin !== 'https://' + selectedDomain) return;
    const store = new URL(value.store_origin);
    if (store.protocol !== 'https:' || store.username || store.password || store.search || store.hash || store.pathname !== '/' || store.hostname !== selectedDomain) return;
    if (el('activate-command').textContent) el('activate-command').hidden = false;
    for (const [id, route] of [['local-admin','/admin/setup'],['local-products','/admin/products'],['local-storefront','/']]) { el(id).href = new URL(route, store).href; el(id).hidden = false; }
  }
  async function loadProvisioning(id) {
    const current = generation, serial = ++provisionRequest;
    const valid = () => selected === id && generation === current && serial === provisionRequest && csrf;
    const results = await Promise.allSettled([request('/installations/' + encodeURIComponent(id) + '/install-instructions'), request('/installations/' + encodeURIComponent(id) + '/install-progress')]);
    if (!valid()) return;
    try { if (results[0].status === 'fulfilled') showInstructions(results[0].value); } catch { text('installer-status', 'Metadata rilis belum dapat dikonfirmasi. Jangan jalankan installer sebelum verifikasi.'); }
    try { if (results[1].status === 'fulfilled') showProgress(results[1].value); else text('progress-status', 'Progres belum dapat dimuat. Coba periksa kembali.'); } catch { text('progress-status', 'Progres belum dapat dikonfirmasi. Periksa kembali sebelum melanjutkan.'); }
  }
  function clearDomain() {
    domainChallenge=null;domainAttempt=null;el('domain-proof-record').hidden=true;el('domain-proof-check').disabled=true;
    for(const id of ['domain-proof-name','domain-proof-value','domain-proof-expiry'])text(id,'');
    text('domain-proof-status','Belum ada bukti domain yang dikonfirmasi.'); text('wizard-domain', 'Perlu bukti kepemilikan');
  }
  function showDomain(challenge) {
    clearDomain();
    if(!challenge)return;
    domainChallenge=challenge;el('domain-proof-record').hidden=false;
    text('domain-proof-name',challenge.record_name);text('domain-proof-value',challenge.record_value);text('domain-proof-expiry',timestamp(challenge.expires_at));
    text('wizard-domain',challenge.status==='OWNERSHIP_VERIFIED'?'Bukti domain dilaporkan':'Perlu bukti kepemilikan');
    text('domain-proof-status',challenge.status==='OWNERSHIP_VERIFIED'?'Kendali domain terverifikasi pada '+timestamp(challenge.verified_at)+'. HTTPS dan aplikasi tetap perlu diperiksa.':challenge.status==='CHALLENGE_EXPIRED'?'Instruksi kedaluwarsa. Buat instruksi TXT baru.':'Menunggu rekaman TXT yang cocok atau propagasi DNS.');
    el('domain-proof-check').disabled=challenge.status!=='DNS_PENDING';
  }
  async function loadDomain(id) {
    const current=generation;
    try {const result=await request('/installations/'+encodeURIComponent(id)+'/domain-challenges');if(selected===id&&generation===current&&csrf)showDomain(result.challenge);}
    catch {if(selected===id&&generation===current)text('domain-proof-status','Bukti domain belum dapat dimuat. Coba muat ulang.');}
  }
  function clearSession() {
    clearEmailChallenge(); el('email-auth').hidden = true; for (const id of ['seller-name','seller-store-name','seller-email']) el(id).value = '';
    csrf = null; selected = null; selectedDomain = null; createAttempt = null; clearDomain(); clearProvisioning(); generation++; detailRequest++; clearPairing();
    el('workspace').hidden = true; el('wizard-navigation').hidden = true; el('installation-list').replaceChildren(); el('sign-in').hidden = true; el('register').hidden = true; el('sign-out').hidden = true; text('wizard-store', 'Belum dipilih'); text('wizard-domain', 'Perlu bukti kepemilikan'); text('wizard-pairing', 'Menunggu fingerprint');
    el('installation-detail').hidden = true; el('detail-placeholder').hidden = false;
    for (const id of ['detail-name','detail-domain','detail-id','detail-status','detail-version','detail-contact','detail-explanation']) text(id, '');
    el('pairing-code').value = ''; el('store-name').value = ''; el('store-domain').value = ''; text('account-state', 'Tidak terhubung');
    notice(safeErrorMessage('AUTH_REQUIRED'), 'error');
  }
  function fieldError(id, error) { text(id, safeErrorMessage(error?.code)); el(id).hidden = false; }
  function createNode(tag, className, value) {
    const node = document.createElement(tag); if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }
  function timestamp(value) {
    if (!value) return 'Belum ada laporan';
    const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Belum ada laporan' : date.toLocaleString('id-ID');
  }
  function showDetail(installation) {
    if (!installation || typeof installation.installation_id !== 'string') throw new Error('Invalid response');
    clearPairing(); clearDomain(); el('pairing-code').value = ''; el('pairing-error').hidden = true;
    selected = installation.installation_id; selectedDomain = installation.domain; clearProvisioning(); el('wizard-navigation').hidden = false;
    text('wizard-store', 'Rencana tersimpan'); text('wizard-pairing', installation.status === 'PAIRED' || installation.device_id ? 'Perangkat terhubung' : 'Menunggu fingerprint');
    el('detail-placeholder').hidden = true; el('installation-detail').hidden = false;
    text('detail-name', installation.display_name); text('detail-domain', installation.domain);
    text('detail-id', selected); text('detail-status', statusLabel(installation.status));
    text('detail-version', installation.app_version || 'Belum ada versi terlapor');
    text('detail-contact', timestamp(installation.last_heartbeat_at));
    text('detail-explanation', explanations[installation.status] || 'Periksa langkah yang dilaporkan installer. Kontak agent tidak membuktikan seluruh layanan toko siap.');
    for (const button of el('installation-list').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.id === selected));
  }
  async function selectInstallation(id) {
    const current = generation, serial = ++detailRequest;
    const result = await request('/installations/' + encodeURIComponent(id));
    if (current !== generation || serial !== detailRequest || !csrf) return;
    showDetail(result.installation);
    await Promise.all([loadDomain(id), loadProvisioning(id)]);
  }
  async function loadInstallations() {
    el('registry-loading').hidden = false;
    try {
      const current = generation; const result = await request('/installations');
      if (current !== generation || !csrf) return;
      if (!Array.isArray(result.installations)) throw new Error('Invalid response');
      el('installation-list').replaceChildren();
      for (const installation of result.installations) {
        const item = createNode('li'); const button = createNode('button', 'installation-item');
        button.type = 'button'; button.dataset.id = installation.installation_id;
        button.setAttribute('aria-pressed', String(installation.installation_id === selected));
        button.append(createNode('strong', '', installation.display_name), createNode('span', 'domain', installation.domain), createNode('span', 'badge', statusLabel(installation.status)));
        button.addEventListener('click', () => selectInstallation(installation.installation_id).then(() => {
          el('detail-heading').focus({ preventScroll: true }); el('detail').scrollIntoView?.({ block: 'start' });
        }).catch(error => notice(safeErrorMessage(error.code), 'error')));
        item.append(button); el('installation-list').append(item);
      }
      text('registry-count', result.installations.length + ' instalasi');
      el('empty-state').hidden = result.installations.length !== 0;
      if (selected && result.installations.some(item => item.installation_id === selected)) await selectInstallation(selected);
    } finally { el('registry-loading').hidden = true; }
  }
  async function start() {
    clearSession(); notice('Memeriksa layanan instalasi…'); text('account-state', 'Memeriksa sesi…');
    const button = el('refresh'); button.disabled = true;
    try {
      const result = await request('/session');
      if (result.authenticated !== true || !result.csrf_token) throw Object.assign(new Error('AUTH_REQUIRED'), { code: 'AUTH_REQUIRED' });
      csrf = result.csrf_token; text('account-state', 'Akun seller terverifikasi');
      if (typeof result.profile?.store_name === 'string' && result.profile.store_name.length <= 100 && !el('store-name').value) el('store-name').value = result.profile.store_name;
      el('workspace').hidden = false; el('sign-out').hidden = false; await loadInstallations();
      notice('Registry terhubung. Pilih toko atau buat rencana instalasi.');
    } catch (error) {
      notice(safeErrorMessage(error.code), 'error'); text('account-state', 'Tidak terhubung');
      try {
        const auth = await authRequest('/auth/status');
        // Only configured email OTP capabilities may open the account form.
        showEmailEntry(auth);
      } catch { el('sign-in').hidden = true; el('register').hidden = true; el('email-auth').hidden = true; }
    }
    finally { button.disabled = false; }
  }
  function onForm(id, action) {
    const form = el(id); form.addEventListener('submit', async event => {
      event.preventDefault(); if (form.dataset.busy === 'true' || !form.reportValidity()) return;
      form.dataset.busy = 'true'; const button = form.querySelector('button[type=submit]'); button.disabled = true;
      try { await action(form); } finally { form.dataset.busy = 'false'; button.disabled = id==='domain-proof-verify' && domainChallenge?.status!=='DNS_PENDING'; }
    });
  }
  onForm('email-start-form', async () => {
    el('email-auth-error').hidden = true;
    try { await sendEmailCode(); } catch(error) { fieldError('email-auth-error', error); }
  });
  onForm('email-verify-form', async () => {
    if (!emailChallenge) return; el('email-auth-error').hidden = true;
    const current = emailGeneration, storeName = emailMode === 'register' ? el('seller-store-name').value.trim() : '';
    try {
      const result = await emailRequest('/auth/email/verify', {challenge_id:emailChallenge,code:el('email-code').value.trim()});
      if (current !== emailGeneration) return;
      if (result.status !== 'AUTHENTICATED') throw Object.assign(new Error('Invalid account response'), {code:'AUTH_REQUIRED'});
      await start();
      if (!csrf) throw Object.assign(new Error('Session unavailable'), {code:'AUTH_REQUIRED'});
      document.defaultView?.history.replaceState(null, '', '/');
      if (storeName) { el('store-name').value = storeName; el('store-domain').focus(); }
      text('action-announcement', 'Email terverifikasi. Lanjutkan pembuatan toko tanpa login ulang.');
    } catch(error) {
      el('email-code').value = '';
      if (error.code === 'PROFILE_REQUIRED') setEmailMode('register');
      fieldError('email-auth-error', error);
    }
  });
  el('auth-toggle-login').addEventListener('click', () => setEmailMode('login'));
  el('auth-toggle-register').addEventListener('click', () => setEmailMode('register'));
  el('email-change').addEventListener('click', () => { clearEmailChallenge(); el('seller-email').focus(); });
  el('email-resend').addEventListener('click', async () => {
    const button = el('email-resend'); if (button.disabled) return; button.disabled = true; el('email-auth-error').hidden = true;
    try { await sendEmailCode(); } catch(error) { button.disabled = false; fieldError('email-auth-error', error); }
  });
  onForm('create-form', async () => {
    el('create-error').hidden = true;
    const body = { display_name: el('store-name').value.trim(), domain: el('store-domain').value.trim(), profile: 'fresh_vps_ubuntu_amd64', requested_install_version: 'stable' };
    const key = JSON.stringify(body);
    if (!createAttempt || createAttempt.body !== key) createAttempt = { body: key, id: globalThis.crypto.randomUUID() };
    try {
      const result = await request('/installations', { method: 'POST', body, idempotencyKey: createAttempt.id });
      createAttempt = null; showDetail(result.installation); await loadInstallations();
      text('action-announcement', 'Rencana instalasi tersimpan. Aplikasi belum dipasang di VPS.');
      el('detail-heading').scrollIntoView?.({ block: 'start' });
    } catch (error) { fieldError('create-error', error); }
  });
  onForm('pairing-form', async () => {
    clearPairing(); el('pairing-error').hidden = true;
    const userCode = el('pairing-code').value.trim().toUpperCase();
    try {
      const result = await request('/pairing-sessions/lookup', { method: 'POST', body: { user_code: userCode } });
      if (result.installation_id !== selected || result.status !== 'PENDING' || !result.pairing_session_id || !result.public_key_thumbprint || !Array.isArray(result.scopes)) {
        throw Object.assign(new Error('PAIR_NOT_FOUND'), { code: 'PAIR_NOT_FOUND' });
      }
      pairing = { id: result.pairing_session_id, code: userCode, thumbprint: result.public_key_thumbprint };
      text('device-fingerprint', result.public_key_thumbprint); text('device-scopes', result.scopes.join(', ')); text('device-expiry', timestamp(result.expires_at));
      el('pairing-confirm').hidden = false; el('confirm-device').focus();
    } catch (error) { fieldError('pairing-error', error); }
  });
  el('pairing-code').addEventListener('input', clearPairing);
  onForm('pairing-confirm', async () => {
    if (!pairing || !el('confirm-device').checked) return;
    try {
      const result = await request('/pairing-sessions/' + encodeURIComponent(pairing.id) + '/approve', {
        method: 'POST', body: { user_code: pairing.code, public_key_thumbprint: pairing.thumbprint, confirm: true },
      });
      if (result.installation_id !== selected || result.status !== 'PAIRED') throw new Error('Invalid response');
      clearPairing(); el('pairing-code').value = ''; await selectInstallation(selected); await loadInstallations();
      text('action-announcement', 'VPS terhubung. Status pemasangan aplikasi perlu diperiksa terpisah.');
    } catch (error) { clearPairing(); fieldError('pairing-error', error); }
  });
  onForm('domain-proof-create',async()=>{
    if(!selected||!csrf)return;
    const id=selected,current=generation;
    if(!domainAttempt||domainAttempt.installation!==id)domainAttempt={installation:id,id:globalThis.crypto.randomUUID()};
    try {
      const result=await request('/installations/'+encodeURIComponent(id)+'/domain-challenges',{method:'POST',body:{},idempotencyKey:domainAttempt.id});
      if(selected===id&&generation===current&&csrf){domainAttempt=null;showDomain(result.challenge);text('action-announcement','Instruksi TXT dibuat. Tambahkan rekaman pada penyedia DNS Anda.');}
    } catch(error) {if(selected===id&&generation===current)text('domain-proof-status',safeErrorMessage(error.code));}
  });
  onForm('domain-proof-verify',async()=>{
    if(!selected||!csrf||!domainChallenge)return;
    const id=selected,current=generation,challenge=domainChallenge.challenge_id;
    try {
      const result=await request('/installations/'+encodeURIComponent(id)+'/domain-challenges/'+encodeURIComponent(challenge)+'/verify',{method:'POST',body:{}});
      if(selected===id&&generation===current&&csrf)showDomain(result.challenge);
    } catch(error) {if(selected===id&&generation===current)text('domain-proof-status',safeErrorMessage(error.code));}
  });
  el('sign-out').addEventListener('click', async () => {
    const button = el('sign-out'); if (button.disabled || !csrf) return; button.disabled = true;
    try { await request('/session/logout', { method:'POST', body:{} }); clearSession(); await start(); notice('Sesi portal pada perangkat ini telah diakhiri.'); }
    catch(error) { notice(safeErrorMessage(error.code), 'error'); }
    finally { button.disabled = false; }
  });
  el('refresh-progress').addEventListener('click', async () => {
    if (!selected || !csrf) return; const button=el('refresh-progress'); button.disabled=true;
    try { clearProvisioning(); await loadProvisioning(selected); } finally { button.disabled=false; }
  });
  el('refresh').addEventListener('click', start);
  el('focus-create').addEventListener('click', () => el('store-name').focus());
  return { start };
}

if (typeof document !== 'undefined') mountDashboard(document).start();
