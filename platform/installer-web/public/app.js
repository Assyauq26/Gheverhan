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
  AUTH_UNAVAILABLE: 'Layanan masuk akun belum dikonfigurasi. Instalasi dan pairing belum dapat dijalankan.',
  AUTH_REQUIRED: 'Belum ada sesi seller yang sah. Masuk melalui penyedia akun portal, lalu muat ulang halaman ini.',
  EMAIL_NOT_VERIFIED: 'Verifikasi email akun terlebih dahulu, lalu muat ulang.',
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

export function mountDashboard(document, fetcher = globalThis.fetch.bind(globalThis)) {
  const el = id => document.getElementById(id);
  let csrf = null, selected = null, pairing = null, createAttempt = null, generation = 0, detailRequest = 0;
  let domainChallenge = null, domainAttempt = null;
  const request = createApi(fetcher, () => csrf, () => clearSession());
  const authRequest = createApi(fetcher, () => null, () => {}, '');
  const text = (id, value) => { el(id).textContent = value; };
  function notice(message, tone = 'neutral') {
    text('notice-message', message); el('service-notice').dataset.tone = tone;
  }
  function clearPairing() {
    pairing = null; el('pairing-confirm').hidden = true; el('confirm-device').checked = false;
    text('device-fingerprint', ''); text('device-scopes', ''); text('device-expiry', '');
  }
  function clearDomain() {
    domainChallenge=null;domainAttempt=null;el('domain-proof-record').hidden=true;el('domain-proof-check').disabled=true;
    for(const id of ['domain-proof-name','domain-proof-value','domain-proof-expiry'])text(id,'');
    text('domain-proof-status','Belum ada bukti domain yang dikonfirmasi.');
  }
  function showDomain(challenge) {
    clearDomain();
    if(!challenge)return;
    domainChallenge=challenge;el('domain-proof-record').hidden=false;
    text('domain-proof-name',challenge.record_name);text('domain-proof-value',challenge.record_value);text('domain-proof-expiry',timestamp(challenge.expires_at));
    text('domain-proof-status',challenge.status==='OWNERSHIP_VERIFIED'?'Kendali domain terverifikasi pada '+timestamp(challenge.verified_at)+'. HTTPS dan aplikasi tetap perlu diperiksa.':challenge.status==='CHALLENGE_EXPIRED'?'Instruksi kedaluwarsa. Buat instruksi TXT baru.':'Menunggu rekaman TXT yang cocok atau propagasi DNS.');
    el('domain-proof-check').disabled=challenge.status!=='DNS_PENDING';
  }
  async function loadDomain(id) {
    const current=generation;
    try {const result=await request('/installations/'+encodeURIComponent(id)+'/domain-challenges');if(selected===id&&generation===current&&csrf)showDomain(result.challenge);}
    catch {if(selected===id&&generation===current)text('domain-proof-status','Bukti domain belum dapat dimuat. Coba muat ulang.');}
  }
  function clearSession() {
    csrf = null; selected = null; createAttempt = null; clearDomain(); generation++; detailRequest++; clearPairing();
    el('workspace').hidden = true; el('installation-list').replaceChildren(); el('sign-in').hidden = true;
    el('installation-detail').hidden = true; el('detail-placeholder').hidden = false;
    for (const id of ['detail-name','detail-domain','detail-id','detail-status','detail-version','detail-contact','detail-explanation']) text(id, '');
    el('pairing-code').value = ''; text('account-state', 'Tidak terhubung');
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
    selected = installation.installation_id;
    el('detail-placeholder').hidden = true; el('installation-detail').hidden = false;
    text('detail-name', installation.display_name); text('detail-domain', installation.domain);
    text('detail-id', selected); text('detail-status', statusLabel(installation.status));
    text('detail-version', installation.app_version || 'Belum terpasang');
    text('detail-contact', timestamp(installation.last_heartbeat_at));
    text('detail-explanation', explanations[installation.status] || 'Periksa langkah yang dilaporkan installer. Kontak agent tidak membuktikan seluruh layanan toko siap.');
    for (const button of el('installation-list').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.id === selected));
  }
  async function selectInstallation(id) {
    const current = generation, serial = ++detailRequest;
    const result = await request('/installations/' + encodeURIComponent(id));
    if (current !== generation || serial !== detailRequest || !csrf) return;
    showDetail(result.installation);
    await loadDomain(id);
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
      el('workspace').hidden = false; await loadInstallations();
      notice('Registry terhubung. Pilih toko atau buat rencana instalasi.');
    } catch (error) {
      notice(safeErrorMessage(error.code), 'error'); text('account-state', 'Tidak terhubung');
      try {
        const auth = await authRequest('/auth/status');
        // Only the backend's fixed same-origin entry point may become a login link.
        el('sign-in').hidden = !(auth.configured === true && auth.login_url === '/auth/login');
      } catch { el('sign-in').hidden = true; }
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
      if(selected===id&&generation===current&&csrf){showDomain(result.challenge);text('action-announcement','Instruksi TXT dibuat. Tambahkan rekaman pada penyedia DNS Anda.');}
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
  el('refresh').addEventListener('click', start);
  el('focus-create').addEventListener('click', () => el('store-name').focus());
  return { start };
}

if (typeof document !== 'undefined') mountDashboard(document).start();
