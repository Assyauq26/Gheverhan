# R19 — Keamanan yang masih terbuka

Status saat kualifikasi P0: **NOT READY** untuk release keseluruhan.
Audit lockfile aktual sebelum pembaruan kompatibel: **2 Critical, 9 High,
7 Moderate (18 package entries)**. Ini berbeda dari snapshot R18 (23 entries).
Containment mengurangi reachability tooling; tidak berarti advisory telah hilang.
Rincian dependency/advisory/version akan dilampirkan sebelum PR dinyatakan selesai.

| ID / severity | Source / reproduksi aman | Expected vs actual / root cause | Tindak lanjut / status / risiko |
| --- | --- | --- | --- |
| R19-SEC-01 Critical | package-lock.json, npm audit resmi | Dependency tooling masih memiliki advisory RCE. Unit CI benar-benar offline dan API/UI/debugger dimatikan; installed versions tetap rentan. | Upgrade kompatibel setelah kualifikasi; major upgrades perlu review pemilik. Tetap OPEN sampai audit ulang. |
| R19-SEC-02 High | auth.service.ts:69–76; audit source, tidak memanggil reset nyata | Token reset masih plaintext dalam DB dan dicetak ke log; pesan delivery tidak didukung pengiriman email. | PR #37 fc738f5 sudah memuat digest, atomic consume dan email fail-closed. Belum diintegrasikan; provider harus dikonfigurasi pemilik. |
| R19-SEC-03 High | auth/session.ts:41 dan auth.service.ts:80; audit source | Logout hanya menghapus cookie; reset password tidak mencabut JWT yang sudah diterbitkan. | Revocation dan durable throttling masih perlu tindak lanjut teruji pada scope auth. Tidak dinyatakan selesai. |
| R19-SEC-04 High | orders.service.ts expiry dan PR #38 134c6f9 | Baseline masih dapat melepas reservasi proof-under-review. #38 menambah predicate under row lock, authentication cron, batch 50 dan idempotent lifecycle. | Review source #38 selesai, penerapan/config produksi belum. Tidak menjalankan cron terhadap produksi. |
| R19-SEC-05 High exposure assessment | git ls-tree metadata .postgres | 1.481 tracked runtime paths, total 67.327.374 bytes. Snapshot fisik dapat mengandung data/credential; isi tidak dibaca dan kebocoran nilai nyata belum dibuktikan. | PR #39 HOLD / keputusan incident pemilik. Tidak rewrite history, menghapus data lama, atau rotate credential. |

PR #38 memakai timingSafeEqual dengan pemeriksaan panjang, fail-closed bila
CRON_SECRET tidak tersedia, re-check eligibility di bawah order lock, dan hanya
mengabaikan HttpError 409 yang diharapkan. Error DB lain tetap dilempar agar retry
cron dapat terjadi. Batch harian 50 membutuhkan penilaian backlog; proof yang sudah
masuk sebelum tenggat tetap membutuhkan rekonsiliasi finansial. Voucher release
#41 memakai lifecycle yang sama, tetapi kombinasi #38 belum diklaim lulus pada stack ini.

Issuer/audience dan algoritma JWT #42 tetap diverifikasi; secret Preview/production
harus berbeda. Pembacaan credential/provider settings tidak menjadi bukti bahwa
binding efektif telah disetujui. Tidak ada token, cookie, DSN, atau key yang ditulis
ke artifact publik. Seluruh mutation test memakai PostgreSQL disposable loopback.
