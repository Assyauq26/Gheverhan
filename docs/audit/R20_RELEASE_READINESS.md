# R20 — Release readiness

Status keseluruhan: **NOT READY**.

| Gate | Status / alasan |
| --- | --- |
| READY FOR SOURCE REVIEW | Source lokal reviewable: #61+#60+#59, hardening RLS/auth, cart/payment dan dependency; semua hasil final harus dibaca per-SHA |
| READY FOR STAGING |Belum: binding database/JWT/storage/provider dummy terisolasi belum diverifikasi; deployment R20 diblokir |
| READY FOR PRODUCTION |Tidak: staging, persetujuan residual High/configuration, CI final dan rollout database belum terpenuhi |

Critical dependency2→0, High8→7, Moderate5→2 setelah Vitest4.1.11 dan patch Tailwind3.4.19.
High CSS/glob/lint tetap resmi OPEN, termasuk braces tanpa patched release. Analisis tidak
menemukan route runtime yang memasukkan input CSS/glob pengguna, tetapi ini bukan persetujuan
risiko oleh pemilik. Tidak menerapkan major Next otomatis atau mengubah severity untuk audit hijau.

Reproduksi independen R19: renderer asli FAILED418, backport PASS; checksum fail-closed dan
lost-ping regression tetap diuji. Tambahan High RLS revocation fail-open direproduksi dan
diperbaiki; ketiga identity queries menolak role tidak tepercaya serta database failure.
Cart/register/login/logout replay dan payment checkout/proof/reject/resubmit/late approval
terbukti melalui browser dengan DB dummy. Domain finansial tidak diganti oleh label UI.
Migrasi/lock/idempotent retry/backup restore/default/FK/index/RLS diuji hanya pada disposable PG.

Kandidat sebelum freeze:221 unit+25 containment offline,94 PostgreSQL,17 produk/cart,
21 operations/payment, typecheck/lint/build PASS. Gate akhir10×44 wajib identik HEAD/build/
Node/browser dan tanpa hydration/page errors. Hasil disimpan pada matriks per-SHA dan laporan
FINAL_RESULTS lokal; jika satu run gagal, status gate FAILED dan perlu perbaikan/source baru.
Dokumen ini dibekukan sebelum gate. Hasil SHA #61 tidak menggantikan source gabungan R20.

## Blocker dan tindakan pemilik

1. GitHub saat publikasi integrasi401Bad credentials: pemulihan koneksi dibutuhkan untuk push,
   Draft integrasi dan CI HEAD akhir. Draft dependency #62 telah dibuat, source PR #60/#61
   dipertahankan. Jangan menganggap credential siap hanya karena network unrestricted.
2. Residual7High: review major CSS/lint kompatibilitas dan mitigation/acceptance pemilik;
   jangan merge sebagai production-ready sebelum keputusan tertulis dan verifikasi yang relevan.
3. Staging terisolasi: dummy DB/JWT/storage/mail sink/manual payment dan scoped bindings;
   tidak mengganti staging dengan production atau shared Preview yang belum terverifikasi.
4. Migrasi shared/production, trusted role/RLS, pooling/lock budget, backup/PITR restore nyata,
   mail/JWT/cron configuration/backlog perlu review dan persetujuan eksekusi eksplisit.
5. Registrasi409/reset provider-error enumeration residual memerlukan desain UX/outbox;
   jangan mengklaim semua enumeration hilang setelah dummy bcrypt. Rate limit fixed-window
   bukan WAF/per-IP, global quota juga perlu review traffic/availability.
6. PostgreSQL tracked exposure #39 tetap HOLD; assessment/retention/history/credential decisions
   milik pemilik. Tidak membaca snapshot, merotasi credential, atau rewrite history.
7. Efektif required checks/protection serta konfigurasi provider live belum dibuktikan. Semua
   CI yang tersedia harus PASS pada HEAD final sebelum release, bukan hanya green unit.

Tidak ada merge main, production deployment, shared migration/reset/seed, real payment/email,
provider credential/security writes atau force push. Pekerjaan aman tidak dihentikan oleh
blocker publikasi; source, laporan dan bukti lokal tetap diselesaikan untuk review.
