# R20 — Baseline dan recovery

Tanggal: 17 Oktober 2026 (UTC). Status awal: **NOT READY**.

- `git fetch --all --prune` berhasil. Main `8e2a4f475333b1beb68063e6e060aa1247e2b90c` mencakup PR #59 dan tidak ditulis oleh R20.
- PR #61: `afb8b34a00bd759426ca0a95332bac74306f66a5`, branch `fix/remediation-r19-react-lost-ping`. PR #60: `491a1dc47f1efa9c395246198fba96993c6f6fcc`.
- Working tree awal `/workspace/Gheverhan` tetap pada #58 `dbb529e`, dengan WIP navigation/probe, next-env.d.ts dan docs/audit. Tidak di-reset, di-stash, atau ditimpa. Seluruh worktree eksperimen R19 dipertahankan.
- Branch integrasi baru `integration/r20-release-hardening-cart-sync` dibuat dari head aktual #61; worktree `/workspace/scratch/r20/integration`. Perubahan #60 belum diintegrasikan pada saat baseline.
- Ketujuh laporan R19 dan tabel advisory dibaca. Hasil R19 merupakan bukti historis untuk SHA-nya sendiri, bukan bukti kandidat source R20.
- PR #61 dan #60 beserta commit, diff, komentar/review dan CI diperiksa. Tidak ada review manusia yang tercatat saat recovery; komentar bot deployment tidak dipakai sebagai persetujuan isolasi staging.
- Baseline lockfile: Next15.5.28, React18.3.1 publik/React App Router bundled19.2 canary, Prisma5.22.0, Vitest2.1.9; audit sebelumnya2 Critical/8 High/5 Moderate wajib diulang.
- Environment revision25 current/enforced, networking unrestricted; tidak ada secret/runtime bindings atau outbound identities untuk staging terisolasi yang terverifikasi. Tidak memeriksa nilai credential.
- PR #59 dashboard/nav harus dipertahankan. Konflik potensial admin order detail #60/#61 wajib diselesaikan dengan mempertahankan review proof yang lewat deadline.

Batas: seluruh mutation test hanya pada PostgreSQL loopback disposable. Main, production, shared Preview/Supabase, credential dan layanan live tidak diubah. Draft PR integrasi baru dibuat setelah hasil reviewable tersedia. Deployment staging tetap BLOCKED sampai database/JWT/storage/provider dummy yang terpisah dapat diverifikasi.
