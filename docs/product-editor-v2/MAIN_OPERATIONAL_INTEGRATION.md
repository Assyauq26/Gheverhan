# Integrasi perbaikan operasional main ke PR #87

Parent feature: `5132575e17eabd9b82dc5d6cce88fabc497b9985`.
Parent main: `7bb457e05cd46477b0764041d5f4a38187782e67` (PR #92 dan #93 sudah direview/merged).

Empat konflik add/add ditelaah dan diselesaikan:

- `.github/workflows/production-read-only-preflight.yml`: pertahankan main yang memakai immutable candidate + operational pins, source checksum, CA lifetime, safe child diagnostics dan required environment approval.
- `.github/tests/production-read-only-preflight.test.mjs`: pertahankan seluruh main protection/cone regression; tidak menurunkan persyaratan reviewer/main-only.
- `frontend/scripts/release/runtime-role-probe.mjs`: pertahankan main CA/errorCode/redaction/report separation; kelima raw SQL timeout/metadata statements identik dengan parent feature. Kontrak schema USAGE, individual CRUD AND dan RLS tetap berlaku.
- `frontend/tests/unit/runtime-role-probe.test.ts`: pertahankan regression main untuk target/DSN/typed error/secret redaction/Windows-compatible entrypoint.

Seluruh `frontend/src`, Prisma schema/migrations, package.json/lockfile, `preflight.ts` dan `storage-preflight.ts` byte-identical terhadap parent feature. Fitur produk, UI, transaksi dan data tidak diubah. Kedua ancestry dipertahankan melalui merge main ke branch PR, bukan merge PR #87 ke main atau rewrite history.

## Bukti operasional baru

Protected read-only run `39873649870` pada main parent berhasil menampilkan full metadata (tidak lagi RELEASE_METADATA_UNAVAILABLE pada attempt pertama). Connection/identity/grants tabel existing PASS; ledger mismatch sesuai satu migration V2 pending; schema V2 absent; bucket product-images public; config belum PASS karena MAINTENANCE_MODE pada GitHub job kosong. Vercel runtime MAINTENANCE_MODE tetap 0; penyelarasan GitHub variable bukan aktivasi maintenance Production.

10 ledger checksums cocok dengan kandidat, 0 incomplete. Pending tunggal `20261021093000_product_editor_staged_media_shipping`, checksum `63eefd28491f47b5ed269539d88b52b985f47aac4b620e6600f1607f06414198`.

PR #93 HEAD CI: 336 unit,25 containment,9 mitigation,11 policy,30 targeted,12 TLS controls PASS; full PostgreSQL/browser/production build PASS; artifact 10x44 satu SHA/build,0 pageErrors/0 hydrationErrors.

HEAD integrasi PR #87 dan CI final dicatat pada body PR setelah push. Jangan memakai hasil parent 5132575 sebagai bukti HEAD gabungan. Tidak merge #87, migrate, deploy, private-bucket, credential changes atau cleanup activation. NO-GO tetap berlaku sampai gate runtime parity, Preview writer isolation, migration/private Storage, visual sign-off dan residual dependency risk/operational approvals selesai.
