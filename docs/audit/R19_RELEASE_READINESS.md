# R19 — Kesiapan release

**NOT READY** untuk merge/deploy production.

Dua akar P0 telah diidentifikasi dengan reproduksi sebelum/sesudah dan backport
upstream minimal: hydration cursor replay (#35494), serta wakeable lost ping
(#36134). Kandidat lulus production build, typecheck/lint, Prisma validation,
177 unit + 25 containment offline, 84 PostgreSQL, 16 product browser, 20 operations
browser, dan satu full navigation run 36 pemeriksaan di empat viewport.
Gate sepuluh run identik masih wajib dan hasilnya dicatat terpisah; satu kandidat
PASS tidak dipakai untuk mengklaim stabilitas.

Blocker release keseluruhan: advisory dependency Critical/High yang belum selesai,
password reset/session/revocation/throttling, penerapan/review cron #38, assessment
runtime PostgreSQL tracked, serta verifikasi setting/Preview kandidat yang tepat.
Persetujuan merge/deploy/migrasi Supabase bersama tetap milik pemilik.

Branch fix: `fix/remediation-r19-react-lost-ping`, melanjutkan baseline PR #58.
Satu PR fix akan dipublikasikan setelah hasil konkret tersedia; #58 tetap jejak
diagnosis. Tidak membuat PR untuk setiap eksperimen. Main/production/Supabase
bersama tidak diubah. Source eksperimen Next 16 dan diagnostic response patch
bukan bagian perilaku aplikasi release.

Baca `R19_HYDRATION_ROOT_CAUSE.md`, `R19_NAVIGATION_REMEDIATION.md`,
`R19_STABILITY_MATRIX.md`, `R19_CROSS_PR_VALIDATION.md`, dan
`R19_SECURITY_REMAINING.md` untuk bukti serta batas klaim.
