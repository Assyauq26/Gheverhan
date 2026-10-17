# R20 — Autentikasi dan sesi

## R20-AUTH-01 · High · RLS menyembunyikan revocation

Source: `frontend/src/lib/auth/session-state.ts:activeSessionWhere` dan tiga query identity `session.ts`.
Reproduksi independen dengan role NOLOGIN + SELECT grants, tanpa kebijakan RLS:
revocation tersimpan tetapi tidak terlihat; filter `revokedSessions.none` lama menerima user.
Bukti sebelum: `roleRlsActive=true`, `revokedSessionAcceptedByOldFilter=true` pada PostgreSQL disposable.
Expected: konfigurasi server yang tidak dapat memeriksa revocation harus menolak autentikasi.

Fix: pemeriksaan capability katalog PostgreSQL sebelum ketiga query identity; RLS harus aktif,
role harus mempunyai SELECT, dan row security tidak boleh membatasi role server. Hasil dimemoisasi
hanya per request React, bukan cache global. DB error tetap dilempar; konfigurasi tidak valid503.
Tidak memberi grant, policy public, BYPASSRLS, atau perubahan role pada layanan bersama.
Regresi: auth-security PostgreSQL role restricted dan trusted; unit ketiga identity query
untuk denied access dan database failure. Hasil per-SHA akhir dirujuk pada PR integrasi.

Baseline independen:203 unit +25 containment offline PASS,8 auth PostgreSQL PASS sebelum perbaikan;
fixture hydration unpatched FAILED418/patched PASS. Audit baseline2 Critical/8 High/5 Moderate.
Tinjauan kode/upstream menunjukkan checksum dan backport diperlukan serta tetap fail-closed.

Tindak lanjut: review enumeration/timing, login/reset concurrency, token expiry, register,
logout dan environment binding; jangan menganggap key Preview/production terpisah hanya
karena issuer/audience berbeda. Trusted role efektif wajib diverifikasi pada staging terisolasi.

## R20-AUTH-02 · Medium · Shortcut biaya password membedakan akun

`auth.service.ts:authenticate` sebelumnya menolak unknown/inactive sebelum bcrypt,
sehingga biaya verifikasi dapat membedakan jenis akun. Kini ketiganya menjalankan
satu bcrypt cost10 dan memberi denial401 generik; tidak mengklaim latency jaringan
konstan. Limiter global/identifier tetap dieksekusi lebih dulu, termasuk DB fail-closed.
Regresi `auth-credential-work.test.ts` menguji unknown, inactive, wrong password dan
limiter unavailable tanpa membaca data identity setelah DB limiter gagal.

Registrasi masih memberi409 untuk email/telepon duplikat, sesuai UX sebelumnya;
reset provider failure dapat membedakan hasil dari unknown account. Pencegahan
semua enumeration memerlukan persetujuan desain onboarding/verifikasi email atau
outbox yang merespons generik tanpa mengklaim delivery palsu. Ini dicatat terbuka,
bukan diklaim selesai hanya karena biaya bcrypt disetarakan. Tidak mengirim email nyata.
